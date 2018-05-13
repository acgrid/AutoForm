<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>样例表单</title>
</head>
<body>
<h3>表单填写演示</h3>
<?php
if($_SERVER['REQUEST_METHOD'] === 'POST'){
    printf('已提交：<dl><dt>姓名</dt><dt>%s</dt><dt>年龄</dt><dt>%s</dt><dt>性别</dt><dt>%s</dt></dl>', htmlspecialchars($_POST['name']), htmlspecialchars($_POST['age']), htmlspecialchars($_POST['gender']));
}
?>
<form action="" method="post">
    <p><label for="name">姓名</label><input type="text" name="name" id="name" size="20" /></p>
    <p><label for="age">年龄</label><input type="number" name="age" id="age" min="0" /></p>
    <p><label for="gender">性别</label><select name="gender" id="gender"><option value="男">男</option><option value="女">女</option></select></p>
    <button>提交</button>
</form>
</body>
</html>