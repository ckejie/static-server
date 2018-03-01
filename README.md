st-server 随启随用的静态文件服务器
==============================

Running static file server anywhere. 随时随地将你的当前目录变成一个静态文件服务器的根目录.默认读取该目录下面的index.html，如果没有该文件则列出该文件夹下的所有文件

## Installation

Install it as a command line tool via `npm -g`.

```sh
npm install st-server -g
```

## Execution

```sh
$ st-server
// or with port
$ st-server -p 8800
// or with hostname
$ st-server -0 localhost -p 8888
// or with folder
$ st-server -d / 
```


## Visit

```
http://localhost:8800
```
执行命令后，打开浏览器，输入http://localhost:8800


