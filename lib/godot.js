var
    godot = require( "godot" ),
    nconf = require( "nconf" ),
    debug = require( "debug" )( "pt:godot" ),
    client;

debug( "initializing godot" );
var client = godot.createClient({
    type: 'udp'
});

if( nconf.get( "godot:host" ) || nconf.get( "godot:port" ) ){
    debug( "connecting to godot server at: %s:%s",
        nconf.get( "godot:host" ), nconf.get( "godot:port" ) );
    client.connect( nconf.get( "godot:port" ), nconf.get( "godot:host" ) );
}

client.on( "error", console.log.bind(console))

exports.godot = client;

exports.send = function(){
  if( nconf.get( "godot:host" ) || nconf.get( "godot:port" ) ){
    debug( "sending data to godot" );
    client.produce.apply( client, arguments );
  }
  else{
    debug( "wont send data to godot because we haven't connected to it" );
  }
};