<?php
/**
 * Created by PhpStorm.
 * User: Administrator
 * Date: 2018/5/12
 * Time: 9:52
 */

return [
    \PDO::class => function(){
        $pdo = new \PDO('sqlite:' . __DIR__ . DIRECTORY_SEPARATOR . 'db' . DIRECTORY_SEPARATOR . 'db.sqlite3', '', '', [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_STRINGIFY_FETCHES => false,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        $pdo->exec('CREATE TABLE IF NOT EXISTS `pages` (`id` INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, `name` TEXT NOT NULL,`match`	TEXT NOT NULL UNIQUE,`fields` TEXT NOT NULL,`submit` TEXT NOT NULL)');
        $pdo->exec('CREATE TABLE IF NOT EXISTS `files` ( `id` INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, `page` INTEGER NOT NULL, `filename` TEXT NOT NULL, `uploaded` INTEGER NOT NULL, FOREIGN KEY(page) REFERENCES pages(id) )');
        $pdo->exec('CREATE TABLE IF NOT EXISTS `rows` ( `file` INTEGER NOT NULL, `row` INTEGER NOT NULL, `data` TEXT NOT NULL, `error` TEXT, `run` INTEGER, PRIMARY KEY (`file`, `row`), FOREIGN KEY(file) REFERENCES files(id) )');
        return $pdo;
    },
    'settings.displayErrorDetails' => true,
];