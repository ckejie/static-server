const http = require('http');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const util = require('util');
const url = require('url');
const zlib = require('zlib');
const handlebars = require('handlebars');
const mime = require('mime');
const config = require('./config');
const debug = require('debug')('static:server');
const fsStat = util.promisify(fs.stat);
const readdir = util.promisify(fs.readdir);
class StaticServer{
    constructor(argv){
        this.config = Object.assign({},this.config,argv);
        console.log(this.config);
        this.compileTpl = compileTpl();
    }
    start(){
        let server = http.createServer();
        server.on('request',this.request.bind(this));
        server.listen(this.config.port,()=>{
            let serverUrl = `http://${this.config.host}:${this.config.port}`;
            debug(`服务器已经启动，地址为${chalk.red(serverUrl)}`);
        });
    }
    async request(req,res){
       let {pathname} = url.parse(req.url);//获取地址栏输入的pathname
       if(pathname == '/favicon.ico'){
          return this.sendError('NOT FOUND',req,res);
       }
       let filePath = path.join(this.config.root,pathname);
       try {
        let stat = await fsStat(filePath);
        if(stat.isDirectory()){//如果是文件夹的话 列出
            let files = await readdir(filePath);
            files = files.map(file=>({
                name:file,
                url:path.join(pathname,file)
            }))
           let resHtml =  this.compileTpl({
               title:pathname,
               files
           });
           res.setHeader('Content-type','text/html');
           res.end(resHtml);
        }else{
            this.sendFile(req,res,filePath,stat);
        }
       } catch (error) {
           debug(util.inspect(error));
           this.sendError(error,req,res);
       }
    }
    sendFile(req,res,filePath,stat){
        if (this.handleCache(req, res, filePath, stat)) return; //如果走缓存，则直接返回
        res.setHeader('Content-Type',mime.getType(filePath)+';chartset=utf-8');
        let encoding = this.getEncoding(req,res);
        let rs = this.getPartStream(req,res,filePath,stat);
        if(encoding){
            rs.pipe(encoding).pipe(res);
        }else{
            rs.pipe(res);
        }

    }
    sendError(error,req,res){
        res.statusCode = 500;
        res.end(`${error.toString}`);
    }
    getPartStream(req,res,filePath,stat){
        let start = 0;
        let end = stat.size - 1;
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
    handleCache(req, res, filepath, statObj) {
        let ifModifiedSince = req.headers['if-modified-since'];
        let isNoneMatch = req.headers['is-none-match'];
        res.setHeader('Cache-Control', 'private,max-age=30');
        res.setHeader('Expires', new Date(Date.now() + 30 * 1000).toGMTString());
        let etag = statObj.size;
        let lastModified = statObj.ctime.toGMTString();
        res.setHeader('ETag', etag);
        res.setHeader('Last-Modified', lastModified);
        if (isNoneMatch && isNoneMatch != etag) {
            return fasle;
        }
        if (ifModifiedSince && ifModifiedSince != lastModified) {
            return fasle;
        }
        if (isNoneMatch || ifModifiedSince) {
            res.writeHead(304);
            res.end();
            return true;
        } else {
            return false;
        }
    }
    getEncoding(req,res){//解压缩文件
        let acceptEncoding = req.headers['accept-encoding'];
        if(/\bgzip\b/.test(acceptEncoding)){
            res.setHeader('Content-Encoding','gzip');
            return zlib.createGzip();
        }else if(/\bdeflate\b/){
            res.setHeader('Content-Encoding','deflate');
            return zlib.createDeflate();
        }else{
            return null;
        }
    }
}
function compileTpl() {//读取并编译模板
    try {
        let tmp = fs.readFileSync(path.resolve(__dirname,'tmpl','tpl.html'),'utf8');
        return handlebars.compile(tmp);
    } catch (error) {
        debug(`${util.inspect(error)}`)
    }
}
// let server = new StaticServer();
// server.start();

module.exports = StaticServer;