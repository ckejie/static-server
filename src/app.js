const http = require('http');
const path = require('path');
const fs = require('fs');
const util = require('util');
const url = require('url');
const chalk = require('chalk');
const mime = require('mime');
const zlib = require('zlib');
const crypto = require('crypto');
const handlebars = require('handlebars');
const config = require('./config');
const debug = require('debug')('static:app');
const fsStat = util.promisify(fs.stat);
const readDir = util.promisify(fs.readdir);
class StaticServer{
    constructor(argv){
        this.config = Object.assign({},config,argv);
        this.compileTpl = compileTpl();
    }
    startServer(){
        let server = http.createServer();
        server.on('request',this.request.bind(this));
        server.listen(this.config.port,()=>{
            let serverUrl = `http://${this.config.host}:${this.config.port}`;
            debug(`服务已开启，地址为${chalk.green(serverUrl)}`);
        })
    }
   async request(req,res){
        let {pathname} = url.parse(req.url);
        if(pathname == '/favicon.ico'){
            return this.sendError('NOT FOUND',req,res);
        }
        //获取需要读的文件目录
        let filePath = path.join(this.config.root,pathname);
        let statObj = await fsStat(filePath);
        if(statObj.isDirectory()){//如果是一个目录的话 列出目录下面的内容
            let files = await readDir(filePath);
            let isHasIndexHtml = false;
            files = files.map(file=>{
                if(file.indexOf('index.html')>-1){
                    isHasIndexHtml = true;
                }
                return {
                    name:file,
                    url:path.join(pathname,file)
                }
            })
            if(isHasIndexHtml){
                let statObjN = await fsStat(filePath+'/index.html');
                return this.sendFile(req,res,filePath+'/index.html',statObjN);
            }
            let resHtml = this.compileTpl({
                title:filePath,
                files
            })
            res.setHeader('Content-Type','text/html');
            res.end(resHtml);
        }else{
            this.sendFile(req,res,filePath,statObj);
        }
        
    }
    sendFile(req,res,filePath,statObj){
        //判断是否走缓存
        if (this.getFileFromCache(req, res, statObj)) return; //如果走缓存，则直接返回
        res.setHeader('Content-Type',mime.getType(filePath)+';charset=utf-8');
        let encoding = this.getEncoding(req,res);
        //常见一个可读流
        let rs = this.getPartStream(req,res,filePath,statObj);
        if(encoding){
            rs.pipe(encoding).pipe(res);
        }else{
            rs.pipe(res);
        }
    }
    sendError(error,req,res){
        if(error=='NOT FOUND'){
            res.statusCode = 404
        }else{
            res.statusCode = 500;
        }
        res.end(`${util.inspect(error)}`);
    }
    getPartStream(req,res,filePath,statObj){
        let start = 0;
        let end = statObj.size -1;
        let range = req.headers['range'];
        if(range){
            res.setHeader('Accept-Range','bytes');
            res.statusCode = 206;
            let result = range.match(/bytes=(\d*)-(\d*)/);
            if(result){
                start = isNaN(result[1]) ? start : parseInt(result[1]);
                end = isNaN(result[2]) ? end : parseInt(result[2]) - 1;
            }
        }
        return fs.createReadStream(filePath,{
            start,end
        })
    }
    getFileFromCache(req,res,statObj){
        let ifModifiedSince = req.headers['if-modified-since'];
        let isNoneMatch = req.headers['if-none-match'];
        res.setHeader('Cache-Control','private,max-age=60');
        res.setHeader('Expires',new Date(Date.now() + 60*1000).toUTCString());
        let etag = crypto.createHash('sha1').update(statObj.ctime.toUTCString() + statObj.size).digest('hex');
        let lastModified = statObj.ctime.toGMTString();
        res.setHeader('ETag', etag);
        res.setHeader('Last-Modified', lastModified);
        if (isNoneMatch && isNoneMatch != etag) {
            return false;
        }
        if (ifModifiedSince && ifModifiedSince != lastModified) {
            return false;
        }
        if (isNoneMatch || ifModifiedSince) {
            res.statusCode = 304;
            res.end('');
            return true;
        } else {
            return false;
        }
    }
    getEncoding(req,res){
        let acceptEncoding = req.headers['accept-encoding'];
        if(acceptEncoding.match(/\bgzip\b/)){
            res.setHeader('Content-Encoding','gzip');
            return zlib.createGzip();
        }else if(acceptEncoding.match(/\bdeflate\b/)){
            res.setHeader('Conetnt-Encoding','deflate');
            return zlib.createDeflate();
        }else{
            return null;
        }
    }
}
function compileTpl(){ //解析模板
    try {
        let tmpHtml = fs.readFileSync(path.resolve(__dirname,'template','tpl.html'),'utf8');
        return handlebars.compile(tmpHtml);
    } catch (error) {
        debug(`${util.inspect(error)}`)
    }
    
}
// let stServer = new StaticServer();
// stServer.startServer();

module.exports = StaticServer;