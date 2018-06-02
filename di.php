<?php
/**
 * Created by PhpStorm.
 * User: Administrator
 * Date: 2018/5/12
 * Time: 9:52
 */

// 定义依赖关系
return [
    // 接口 到 实现的定义方式
    // 这里定义了需要PHP数据库抽象层PDO的具体实现，应用了工厂方法建立了一个唯一实例，供各个依赖项目使用
    \PDO::class => function(){
        // 简便起见，使用本地的文件数据库SQLite
        $pdo = new \PDO('sqlite:' . __DIR__ . DIRECTORY_SEPARATOR . 'db' . DIRECTORY_SEPARATOR . 'db.sqlite3', '', '', [
            // 设定错误抛出异常，使编写流畅
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            // 设定默认用关联数组返回结果
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            // 以下两项使得PDO尽量保持数据库数据类型到PHP变量类型的一致性
            PDO::ATTR_STRINGIFY_FETCHES => false,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        // 自动包含建表SQL，无需手动安装数据库
        $pdo->exec('CREATE TABLE IF NOT EXISTS `pages` (`id` INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, `name` TEXT NOT NULL,`match`	TEXT NOT NULL UNIQUE,`fields` TEXT NOT NULL,`submit` TEXT NOT NULL)');
        $pdo->exec('CREATE TABLE IF NOT EXISTS `files` ( `id` INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, `page` INTEGER NOT NULL, `filename` TEXT NOT NULL, `uploaded` INTEGER NOT NULL, FOREIGN KEY(page) REFERENCES pages(id) )');
        $pdo->exec('CREATE TABLE IF NOT EXISTS `rows` ( `file` INTEGER NOT NULL, `row` INTEGER NOT NULL, `data` TEXT NOT NULL, `error` TEXT, `run` INTEGER, PRIMARY KEY (`file`, `row`), FOREIGN KEY(file) REFERENCES files(id) )');
        // 完成数据库配置，返回PDO实例
        return $pdo;
    },
    // 配置项的定义覆盖
    // 配置Slim显示详细错误信息
    'settings.displayErrorDetails' => true,
];