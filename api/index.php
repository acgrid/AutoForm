<?php

use DI\Container;
use Slim\App;
use Slim\Http\Request;
use Slim\Http\Response;

/**
 * 引入初始化脚本
 * 接受返回的依赖注入容器
 * 通过对容器内容的控制，可以更换不同的数据库后端，模拟各式请求对象进行测试，具有很强的灵活性
 * @var $di Container
 */
$di = require '../init.php';

// 创建自定义的应用对象
$app = new App($di);

// 开始注册路由，此处加入一个路由组以便批量应用中间件
$app->group('', function(){
    // $this 在这个闭包内被绑定到了App对象，该对象有一系列注册路由的方法，方法名为对应HTTP动词，参数依次为路由模式和匹配该路由的回调函数
    /** @var Slim\App $this */
    $this->get('/', function(){
        // 首页暂无特别定义，可以加上使用说明等内容
    });
    // 匹配页面及获取表单配置，注意$pdo为依赖注入，类似Autowiring，即使用di.php中的定义的对象。$request，$response为请求及响应的PSR-7封装，下同
    $this->get('/page', function(Request $request, Response $response, \PDO $pdo){
        // 获取请求参数，访问页面的URL
        $url = trim($request->getQueryParam('url', ''));
        // 无效请求，返回空结果
        if(empty($url)){
            return $response->withJson(null);
        }
        // 使用准备语句配置SQL，避免转义的麻烦和SQL注入
        $stmt = $pdo->prepare("SELECT * FROM pages WHERE ? LIKE `match` || '%'");
        // 以左匹配获得符合条件的表单页面
        $stmt->execute([$url]);
        // 选出符合条件的页面对应的已上传文件清单
        $fileStmt = $pdo->prepare("SELECT id, filename, uploaded, (SELECT COUNT(*) FROM rows WHERE file = f.id) AS rows, (SELECT COUNT(*) FROM rows WHERE file = f.id AND run IS NOT NULL) AS ran FROM files AS f WHERE page = ? ORDER BY id DESC LIMIT 1");
        if($page = $stmt->fetch()){
            $page['id'] = intval($page['id']);
            $page['fields'] = json_decode($page['fields']);
            $fileStmt->execute([$page['id']]);
            // 将文件清单映射转换为数值形式，以免JS中再次转换
            $page['files'] = array_map(function($file){
                $file['id'] = intval($file['id']);
                $file['uploaded'] = intval($file['uploaded']);
                $file['rows'] = intval($file['rows']);
                $file['ran'] = intval($file['ran']);
                return $file;
            }, $fileStmt->fetchAll());
            return $response->withJson($page);
        }else{
            // 表示未命中，是新表单
            return $response->withJson(null);
        }
    });
    // 删除页面表单配置（备用功能），注意$pageId是PHP-DI的Slim支持提供的功能，可以将路由变量作为依赖注入到回调函数中
    $this->delete('/page/{pageId:[0-9]+}', function($pageId, Response $response, \PDO $pdo){
        $stmt = $pdo->prepare('DELETE FROM pages WHERE id = ?');
        $stmt->execute([$pageId]);
        // 返回类似REST的HTTP状态码 No Content 说明数据已删除
        return $response->withStatus(204);
    });
    // 新建或更新表单配置
    $this->post('/page', function(Request $request, Response $response, \PDO $pdo){
        $page = [];
        // 收集并检查各表单变量是否存在
        foreach(['name', 'match', 'fields', 'submit'] as $key){
            $param = $page[] = $request->getParsedBodyParam($key);
            if($key !== 'submit' && empty($param)) return $response->withJson(['error' => "表单信息 $key 为空"]);
        }
        // 表单元素定义是以JSON字符串的形式保存，需检查是否正确
        if(!json_decode($page[2]) || json_last_error() !== JSON_ERROR_NONE) return $response->withJson(['error' => "表单配置字段错误:" . json_last_error_msg()]);
        // 预先判断是新建还是更新
        $testStmt = $pdo->prepare('SELECT id FROM pages WHERE match = ?');
        $testStmt->execute([$page[1]]);
        // 获得存在检测的结果
        $test = $testStmt->fetch();
        if($test){
            $pageId = intval($test['id']);
            $updateStmt = $pdo->prepare('UPDATE pages SET name = ?, fields = ?, submit = ? WHERE id = ?');
            $updateStmt->execute([$page[0], $page[2], $page[3], $pageId]);
        }else{
            $stmt = $pdo->prepare('INSERT OR IGNORE INTO pages (name, match, fields, submit) VALUES (?, ?, ?, ?)');
            $stmt->execute($page);
            $pageId = intval($pdo->lastInsertId());
        }
        // 无论是否新建，均返回表单的ID
        return $response->withJson(compact('pageId'));
    });
    // 为表单上传Excel文件的处理，其中表单页面ID在URL中嵌入
    $this->post('/page/{pageId:[0-9]+}/file', function($pageId, Request $request, Response $response, \PDO $pdo){
        $pageId = intval($pageId);
        // 检查表单ID有效性
        if($pageId <= 0) return $response->withJson(['error' => '所属表单ID未设置']);
        $checkStmt = $pdo->prepare('SELECT fields FROM pages WHERE id = ?');
        $checkStmt->execute([$pageId]);
        if(empty($result = $checkStmt->fetch())) return $response->withJson(['error' => '所属表单ID不存在']);
        // 解析Excel清单所需的比对数据
        $fields = json_decode($result['fields'], true);
        if(!is_array($fields) || empty($fields)) return $response->withJson(['error' => '所属表单定义异常']);
        // 利用PSR-7的文件上传封装处理上传文件
        $file = $request->getUploadedFiles()['upload'] ?? null;
        if($file instanceof \Slim\Http\UploadedFile){
            if($file->getError() === UPLOAD_ERR_OK){
                // 获取上传文件的文件名、扩展名
                $filename = $file->getClientFilename();
                $extension = ucfirst(pathinfo($filename, PATHINFO_EXTENSION));
                // PhpOffice是处理Office文件的第三方库，利用工厂函数建立对应格式的读取器
                $reader = \PhpOffice\PhpSpreadsheet\IOFactory::createReader($extension);
                // 外部数据异常较多，隔离处理
                try{
                    // 加载文件
                    $spreadsheet = $reader->load($file->file);
                    // 获取活动工作表
                    $sheet = $spreadsheet->getActiveSheet();
                    // 获取有数据的最右列名，并转换为数字，如A->1,AA->27
                    $columnCount = \PhpOffice\PhpSpreadsheet\Cell\Coordinate::columnIndexFromString($sheet->getHighestColumn());
                    // 提供的列数少于表单定义的数据项数，提示并返回
                    if($columnCount < count($fields)) return $response->withJson(['error' => sprintf('文件内有%u列，少于表单定义%u个', $columnCount, count($fields))]);
                    // 如果超出定义的列数，忽略多余的列
                    $columnCount = min(count($fields), $columnCount);
                    // 获取有数据的最大行号，即为读取范围
                    $rowCount = $sheet->getHighestRow();
                    // 提示缺少实际数据
                    if($rowCount < 2) return $response->withJson(['error' => '文件内无有效数据，首行不导入']);
                    // 开始数据库事务，提高性能并预防中断导致数据库不一致
                    $pdo->beginTransaction();
                    // 插入文件清单信息：表单ID、文件名、日期
                    $fileStmt = $pdo->prepare('INSERT INTO files (page, filename, uploaded) VALUES (?, ?, ?)');
                    $fileStmt->execute([$pageId, $filename, time()]);
                    $fileId = intval($pdo->lastInsertId());
                    // 插入文件各行的实际数据
                    $rowStmt = $pdo->prepare('INSERT INTO rows (file, row, data) VALUES (?, ?, ?)');
                    for($rowIndex = 2; $rowIndex <= $rowCount; $rowIndex++){
                        // 每行一个数组，按列依次存储各填写项目
                        $data = [];
                        // 从A2单元格开始，逐行、逐列获取数据
                        for($columnIndex = 1; $columnIndex <= $columnCount; $columnIndex++){
                            $value = $sheet->getCellByColumnAndRow($columnIndex, $rowIndex)->getValue();
                            // 若单元格内容包含富文本数据，转换为村文本
                            if($value instanceof \PhpOffice\PhpSpreadsheet\RichText\RichText) $value = $value->getPlainText();
                            // 去除首尾多余的空白
                            $data[] = trim($value);
                        }
                        // 调整行号从1开始，并用JSON存储单行数据
                        $rowStmt->execute([$fileId, $rowIndex - 1, json_encode($data, JSON_UNESCAPED_UNICODE)]);
                    }
                    // 提交事务
                    $pdo->commit();
                    // 返回上传结果，与'/page'路由返回的files内一致
                    return $response->withJson([
                        'id' => $fileId,
                        'filename' => $filename,
                        'uploaded' => time(),
                        'rows' => intval($rowCount - 1),
                        'ran' => 0
                    ]);
                }catch (\Exception $e){
                    return $response->withJson(['error' => '文件读取失败:' . $e->getMessage()]);
                }
            }else{
                return $response->withJson(['error' => '文件上传失败:' . $file->getError()]);
            }
        }else{
            return $response->withJson(['error' => '文件表单错误']);
        }
    });
    // 获取某个具体Excel清单的内容，在用户选择执行具体文件的范围时使用
    $this->get('/file/{fileId:[0-9]+}', function($fileId, Request $request, Response $response, \PDO $pdo){
        if(($fileId = intval($fileId)) <= 0) return $response->withJson(['error' => '文件ID错误']);
        // 行号的起始结束范围，需要同时存在
        $from = $request->getQueryParam('from');
        $to = $request->getQueryParam('to');
        if($from && $to){
            // 按照范围来检索
            $stmt = $pdo->prepare('SELECT data, error, run FROM rows WHERE file = ? AND row >= ? AND row <= ? ORDER BY row ASC');
            $stmt->execute([$fileId, $from, $to]);
        }else{
            // 全部内容
            $stmt = $pdo->prepare('SELECT data, error, run FROM rows WHERE file = ? ORDER BY row ASC');
            $stmt->execute([$fileId]);
        }
        // 返回所有符合条件的行，同时将数据从JSON字符串还原，再次打包为JSON
        return $response->withJson(array_map(function($row){
            $row['data'] = json_decode($row['data']);
            return $row;
        }, $stmt->fetchAll()));
    });
})->add(function(Request $request, Response $response, callable $next){
    // 通用中间件，先执行后续处理，再添加一个CORS头部，以便在其他域下运行的JS代码能获取服务器返回的内容
    /** @var Response $response */
    $response = $next($request, $response);
    return $response->withAddedHeader('Access-Control-Allow-Origin', '*');
});
// 可以在后续添加中间件以支持登录、验证等功能

try{
    // 根据请求，尝试运行
    $app->run();
}catch (\Exception $e){
    // 遇到异常，显示以便调试
    var_dump($e);
}
// 预留后续添加需要长时间处理的代码，可通过register_shutdown_function()将其置入后台运行，而使FCGI的请求处理结束并返回用户浏览器
if(function_exists('fastcgi_finish_request')) fastcgi_finish_request();
