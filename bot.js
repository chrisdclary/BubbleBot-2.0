const COMMAND_PREFIX = '.';

const auth = require('./auth.json');
const Eris = require('eris');
const ytdl = require('ytdl-core');

const bot = new Eris(auth.token);

bot.on("ready", () => {
	console.log("Ready!");
});

let q = new Queue();

bot.on("messageCreate", async msg => {

    if ( msg.author.bot )
        return;

    if ( msg.content.substring(0,1) == COMMAND_PREFIX ) {

        var args = msg.content.substring(1).split(' ');
        var cmd = args[0];
        var textChannel = msg.channel.id;
        args = args.splice(1);

        switch ( cmd ) {

            case 'hello':
                await bot.createMessage(textChannel, `Hello World!`);
                break;
            
            case 'clear':
                q.clear();
                bot.createMessage(textChannel, `\`\`\`Queue cleared!\`\`\``);
                break;
            
            case 'queue': // show queue
                break;
            
            case 'remove': // remove specific song from queue
                break;
            
            case 'skip':
                break;
            
            case 'play':
                if ( args.length > 0 ){
                    if ( ytdl.validateURL(args[0])){
                        q.enqueue(args[0]);
                        connection = bot.voiceConnections.find(conn => conn.id === msg.guildID);
                        if ( !connection ) { // join vc
                            join( textChannel, msg.member );
                        } else { // play song
                            play( connection, textChannel, msg.member );
                        }
                    } else {
                        bot.createMessage(textChannel, `Invalid URL : ${args[0]}.`);
                    }
                    
                } else {
                    bot.createMessage(textChannel, `No URL specified.`);
                }
                
                break;
        }
    }
    
});

async function join( textChannel, member) {
    var voiceChannel = member.voiceState.channelID;

    if ( voiceChannel != null ) {
        connection = await bot.joinVoiceChannel(voiceChannel);
        play( connection, textChannel );
    } else {
        bot.createMessage(textChannel, 'You must be in a voice channel to play a song.');
    }

    connection.on('end', () => {
        if ( !q.isEmpty() ){
            play( connection, textChannel );
        } else {
            bot.leaveVoiceChannel(connection.channelID);
        }
    })
}

async function play( connection, textChannel ) {
    if( !connection.playing ) {
        const info = await ytdl.getInfo(q.peek());
        
        bot.createMessage(textChannel, `\`\`\`Now playing: ${info.videoDetails.title}\`\`\``);
        const stream = ytdl.downloadFromInfo(info, {filter: "audioonly"}).on('response', () => {
            if ( !connection )
                return;
            
            if ( connection.ready ) {
                try {
                    connection.play(stream);
                    q.dequeue();
                } catch (error) {
                    console.log("Something went wrong with playback");
                }
            } else {
                console.log("Connection not ready");
            }
        });
    } else {
        const info = await ytdl.getInfo(q.end());
        bot.createMessage(textChannel, `\`\`\`Queued ${info.videoDetails.title}\`\`\``);
    }

    
}

function Queue() {
    this.elements = [];
}

Queue.prototype.enqueue = function (e) {
    this.elements.push(e);
}

Queue.prototype.dequeue = function () {
    return this.elements.shift();
}

Queue.prototype.isEmpty = function () {
    return this.elements.length == 0;
}

Queue.prototype.peek = function () { 
    return !this.isEmpty() ? this.elements[0] : undefined;
}

Queue.prototype.end = function () {
    return !this.isEmpty() ? this.elements[this.elements.length - 1] : undefined;
}

Queue.prototype.clear = function () {
    this.elements = [];
}


bot.connect();
