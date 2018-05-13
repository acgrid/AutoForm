<?php

use DI\Container;
use Slim\App;
use Slim\Http\Request;
use Slim\Http\Response;

/**
 * @var $di Container
 */
$di = require '../init.php';

$app = new App($di);

$app->group('', function(){
    /** @var Slim\App $this */
    $this->get('/', function(){
        phpinfo();
    });
    $this->get('/page', function(Request $request, Response $response, \PDO $pdo){
        $url = trim($request->getQueryParam('url', ''));
        if(empty($url)){
            return $response->withJson([]);
        }
        $stmt = $pdo->prepare("SELECT * FROM pages WHERE ? LIKE `match` || '%'");
        $stmt->execute([$url]);
        $fileStmt = $pdo->prepare("SELECT id, filename, uploaded, (SELECT COUNT(*) FROM rows WHERE file = f.id) AS rows, (SELECT COUNT(*) FROM rows WHERE file = f.id AND run IS NOT NULL) AS ran FROM files AS f WHERE page = ? ORDER BY id DESC LIMIT 1");
        if($page = $stmt->fetch()){
            $page['id'] = intval($page['id']);
            $page['fields'] = json_decode($page['fields']);
            $fileStmt->execute([$page['id']]);
            $page['files'] = array_map(function($file){
                $file['id'] = intval($file['id']);
                $file['uploaded'] = intval($file['uploaded']);
                $file['rows'] = intval($file['rows']);
                $file['ran'] = intval($file['ran']);
                return $file;
            }, $fileStmt->fetchAll());
            return $response->withJson($page);
        }else{
            return $response->withJson(null);
        }
    });
    $this->delete('/page/{pageId:[0-9]+}', function($pageId, Response $response, \PDO $pdo){
        $stmt = $pdo->prepare('DELETE FROM pages WHERE id = ?');
        $stmt->execute([$pageId]);
        return $response->withStatus(204);
    });
    $this->post('/page', function(Request $request, Response $response, \PDO $pdo){
        $page = [];
        foreach(['name', 'match', 'fields', 'submit'] as $key){
            $param = $page[] = $request->getParsedBodyParam($key);
            if($key !== 'submit' && empty($param)) return $response->withJson(['error' => "页面信息 $key 为空"]);
        }
        if(!json_decode($page[2]) || json_last_error() !== JSON_ERROR_NONE) return $response->withJson(['error' => "页面配置字段错误:" . json_last_error_msg()]);
        $testStmt = $pdo->prepare('SELECT id FROM pages WHERE match = ?');
        $testStmt->execute([$page[1]]);
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
        return $response->withJson(compact('pageId'));
    });
    $this->post('/page/{pageId:[0-9]+}/file', function($pageId, Request $request, Response $response, \PDO $pdo){
        $pageId = intval($pageId);
        if($pageId <= 0) return $response->withJson(['error' => '所属页面ID未设置']);
        $checkStmt = $pdo->prepare('SELECT fields FROM pages WHERE id = ?');
        $checkStmt->execute([$pageId]);
        if(empty($result = $checkStmt->fetch())) return $response->withJson(['error' => '所属页面ID不存在']);
        $fields = json_decode($result['fields'], true);
        if(!is_array($fields) || empty($fields)) return $response->withJson(['error' => '所属页面定义异常']);
        $file = $request->getUploadedFiles()['upload'] ?? null;
        if($file instanceof \Slim\Http\UploadedFile){
            if($file->getError() === UPLOAD_ERR_OK){
                $filename = $file->getClientFilename();
                $extension = ucfirst(pathinfo($filename, PATHINFO_EXTENSION));
                $reader = \PhpOffice\PhpSpreadsheet\IOFactory::createReader($extension);
                try{
                    $spreadsheet = $reader->load($file->file);
                    $sheet = $spreadsheet->getActiveSheet();
                    $columnCount = \PhpOffice\PhpSpreadsheet\Cell\Coordinate::columnIndexFromString($sheet->getHighestColumn());
                    if($columnCount < count($fields)) return $response->withJson(['error' => sprintf('文件内有%u列，少于表单定义%u个', $columnCount, count($fields))]);
                    $columnCount = min(count($fields), $columnCount);
                    $rowCount = $sheet->getHighestRow();
                    if($rowCount < 2) return $response->withJson(['error' => '文件内无有效数据，首行不导入']);
                    $pdo->beginTransaction();
                    $fileStmt = $pdo->prepare('INSERT INTO files (page, filename, uploaded) VALUES (?, ?, ?)');
                    $fileStmt->execute([$pageId, $filename, time()]);
                    $fileId = intval($pdo->lastInsertId());
                    $rowStmt = $pdo->prepare('INSERT INTO rows (file, row, data) VALUES (?, ?, ?)');
                    for($rowIndex = 2; $rowIndex <= $rowCount; $rowIndex++){
                        $data = [];
                        for($columnIndex = 1; $columnIndex <= $columnCount; $columnIndex++){
                            $value = $sheet->getCellByColumnAndRow($columnIndex, $rowIndex)->getValue();
                            if($value instanceof \PhpOffice\PhpSpreadsheet\RichText\RichText) $value = $value->getPlainText();
                            $data[] = trim($value);
                        }
                        $rowStmt->execute([$fileId, $rowIndex - 1, json_encode($data, JSON_UNESCAPED_UNICODE)]);
                    }
                    $pdo->commit();
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
    $this->get('/file/{fileId:[0-9]+}', function($fileId, Request $request, Response $response, \PDO $pdo){
        if(($fileId = intval($fileId)) <= 0) return $response->withJson(['error' => '文件ID错误']);
        $from = $request->getQueryParam('from');
        $to = $request->getQueryParam('to');
        if($from && $to){
            $stmt = $pdo->prepare('SELECT data, error, run FROM rows WHERE file = ? AND row >= ? AND row <= ? ORDER BY row ASC');
            $stmt->execute([$fileId, $from, $to]);
        }else{
            $stmt = $pdo->prepare('SELECT data, error, run FROM rows WHERE file = ? ORDER BY row ASC');
            $stmt->execute([$fileId]);
        }
        return $response->withJson(array_map(function($row){
            $row['data'] = json_decode($row['data']);
            return $row;
        }, $stmt->fetchAll()));
    });
})->add(function(Request $request, Response $response, callable $next){
    /** @var Response $response */
    $response = $next($request, $response);
    return $response->withAddedHeader('Access-Control-Allow-Origin', '*');
});

try{
    $app->run();
}catch (\Exception $e){
    var_dump($e);
}

if(function_exists('fastcgi_finish_request')) fastcgi_finish_request();
