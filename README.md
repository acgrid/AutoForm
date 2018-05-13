# 表单自动提交
##演示环境及要求
###服务端
* PHP 7.1, 7.2
* PDO-SQLite
* Composer
###客户端
* Chrome浏览器或有插件功能的webkit类浏览器
* 浏览器启动开发者模式
* Excel

###具体演示步骤
* 下载PHP `https://windows.php.net/downloads/releases/php-7.2.5-nts-Win32-VC15-x64.zip` 解压到任意目录，如`D:\PHP`
* 将`example\php.ini`复制到PHP目录下，或者手动启动`pdo_sqlite`扩展
* 将`D:\PHP`添加到环境变量`PATH`中
* 在任意命令行下执行`php -m`检查有无报错及`pdo_sqlite`是否出现在扩展列表中
* 下载`https://getcomposer.org/Composer-Setup.exe`安装Composer
* 运行`composer config -g repo.packagist composer https://packagist.phpcomposer.com`选择国内镜像
* 在项目中打开命令行，执行`composer install`安装依赖
* 运行`server.cmd`启动本地服务器，运行在`http://127.0.0.1:8005`

* 安装浏览器，推荐官方Chrome浏览器
* 打开扩展程序界面，即`chrome://extensions/`
* 打开右上角开发者模式
* 将`extension`目录拖入网页区域，启动后完成

## 所用技术及参考文档
* [PHP](https://developer.chrome.com/extensions/)
* [Chrome插件](https://developer.chrome.com/extensions/)
* [DOM文档](http://devdocs.io/dom/)
* [PHPSpreadsheet](https://phpspreadsheet.readthedocs.io/en/develop/)
* JavaScript
* jQuery
* SQLite