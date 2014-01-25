"use strict";

var
  nconf = require( "nconf" ),
  restify = require( "restify" ),
  pkg = require( "./package.json" ),
  logger = require( "./lib/logger" ),
  util = require( "util" ),
  bunyan = require( "bunyan" ),
  ua = require( "universal-analytics" ),
  request = require( "request" ),
  fs = require( "fs" ),
  jade = require( "jade" ),
  libxml = require( "libxmljs" ),
  debug = require( "debug" )( "pt-rss:app" );
nconf
  .argv()
  .env()
  .defaults({
    port: 8081
  });

var godot = require( "./lib/godot" );

var server = restify.createServer({
  name: pkg.name,
  version: pkg.version,
  log: logger.shim
});

server.use(restify.queryParser());
server.use(restify.fullResponse());
server.pre(function( req, res, next ){
  req.visitor = ua( nconf.get( "analytics" ) );
  next();
});
var cache = {};
var render = function( file, locals, next, res ){
  debug( "rendering %s with content: %j", file, locals );
  var fn = function(){
    var content;
    try{
      var content = cache[ file ]( locals );
      res.end( content );
      next()
    }catch( x ){
      next( x );
    }
  };
  if( cache[ file ] ){
    debug( "file (%s) already in cache" , file  );
    return fn();
  }
  var fileName = __dirname + "/views/" + file + ".jade"
  fs.readFile( fileName, function( err, content ){
    if( err ){
      return next( err );
    }
    try{
      cache[ file ] = jade.compile( content.toString(), {
        fileName: fileName
      });
      fn();
    }catch(x){
      next( x );
    }
  });
};

var rssHandler = function rssHanlder( req, res, next ){
  var isMenetrend = ( /iMenetrend/ ).test( req.params.appname );
  var r = request({
    url: "http://mav-start.hu/rss.php",
    encoding: null,
  }, function ( err, response, body ){
      if( err ){
        return next( err );
      }
      if( !isMenetrend ){
        next();
        return;
      }
      res.contentType = "text/xml";
      req.__route = "rss"
      var doc = libxml.parseXml( body );
      var getText = function( el ){
        return el ? el.text() : "";
      };
      var locals = {
          title: getText( doc.get( "//title" ) ),
          link: getText( doc.get( "//link" ) ),
          tagline: getText( doc.get( "//description" ) ),
          lastBuildDate: getText( doc.get( "//lastBuildDate" ) ),
          pubDate: getText( doc.get( "//pubDate" ) ),
          generator: getText( doc.get( "//generator" ) ),
          managingEditor: getText( doc.get( "//managingEditor" ) ),
          webMaster: getText( doc.get( "//webMaster" ) ) 
      };
      var items = ( doc.find( "//item" )||[] ).map(function ( item ){
        return {
         title: getText( item.get( "./title" ) ),
          link: getText( item.get( "./link" ) ),
          description: getText( item.get( "./description" ) ),
          pubDate: new Date( getText( item.get( "./pubDate" ) ) ),
          guid: getText( item.get( "./guid" ) )
        };
      });
      var isiOS = (/ios/).test( req.params.appname )
      var storeLink = isiOS ? "https://itunes.apple.com/hu/app/imenetrend-volan/id788835350?mt=8" : "https://play.google.com/store/apps/details?id=com.artanisdesign.imenetrendvolan&hl=hu";
      items.push({
        title: isiOS ? "Megjelent az iMenetrend Volán kereső alkalmazás" : "Megjelent a Volán menetrend kereső alkalmazás",
        pubDate: new Date( "2014-01-07T13:17:25.979Z" ),
        link: storeLink,
        guid: storeLink
      })
      locals.items = items.sort(function ( a, b ){
        return b.pubDate.getTime() - a.pubDate.getTime();
      });
      render( "rss", locals, next, res );
  });
  if( !isMenetrend ){
    res.setHeader( "Content-Type", "text/xml; charset=iso-8859-1" );
    r.pipe( res );
  }
};
server.get( "/", rssHandler );
server.get( "/elvira/rss", rssHandler );
server.get( "/rss.php", rssHandler );

function onListen( err ){
  if( err ){
    return server.log.error( err );
  }
  server.log.info( "server listening on port: %s in mode: %s", server.address().port, server.mode );
}

server
  .on( "uncaughtException", function (request, response, route, err ){
    console.log( err, err.stack );
    request.visitor
      .exception( err + "" )
      .send();
  })
  .on( "listening", onListen )
  .on( "error", onListen )
  .on( "after", function( req, res, route ){
    req.visitor
      .pageview({ dp:req._path, dh: req.headers["x-forwarded-for"]||req.headers.host})
      .timing( "response", req.url, Date.now() - req._time, util.format( "%j", (route||{}).spec ) )
      .event( "clients", req.query.appname||req.headers["user-agent"] )
      .send();
    godot
      .send({
        service: "api/elvira-rss/response-time",
        metric: ( Date.now() - req._time ) / 1000,
        description: req.url,
        host: require( "os" ).hostname()
      });
  });
if( nconf.get( "debug" ) ){
  server.on( "after", restify.auditLogger({
    log: bunyan.createLogger({
      name: "audit",
      stream: process.stdout
    })
  }));
}


if( module.parent ){
  module.exports = server;
}
else{
  server.listen( nconf.get( "port" ), function () {
    logger.log("info", "%s listening at %s", server.name, server.url);
  });
}