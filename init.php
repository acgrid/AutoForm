<?php

use DI\ContainerBuilder;
// 引入Composer的自动加载器
require __DIR__ . '/vendor/autoload.php';
// 创建PHP-DI实例
$builder = new ContainerBuilder();
// 引入PHP-DI配合Slim框架的典型定义
$builder->addDefinitions(__DIR__ . '/vendor/php-di/slim-bridge/src/config.php');
// 引入自定义依赖关系项目
$builder->addDefinitions(__DIR__ . '/di.php');
// 建立容器并返回
return $builder->build();
