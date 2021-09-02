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
                bot.createMessage(textChannel, {
                    embed: {
                        description: `Queue cleared!`
                    }
                });
                break;

            case 'q':
            case 'queue': // show queue
                if ( q.isEmpty() ) {
                    bot.createMessage(textChannel, {
                        embed: {
                            description: `Queue is empty.`
                        }
                    });
                } else {
                    showQueue(textChannel);
                }
                
                break;
            
            case 'r':
            case 'remove': // remove specific song from queue
                if ( q.isEmpty() ) {
                    bot.createMessage(textChannel, {
                        embed: {
                            description: `Queue is empty.`
                        }
                    });
                    break;
                }
                var num = parseInt(args[0], 10);
                console.log(num);
                if ( isNaN(num) || num < 1 || q.size() < num ) {
                    bot.createMessage(textChannel, {
                        embed: {
                            description: `Can't remove that from the queue.`
                        }
                    });
                } else {
                    remove(textChannel, num);
                }
                break;
            
            case 'skip':
                connection = bot.voiceConnections.find(conn => conn.id === msg.guildID);
                var voiceChannel = msg.member.voiceState.channelID;
                if ( !connection ) {
                    bot.createMessage(textChannel, {
                        embed: {
                            description: `Not playing music rn.`
                        }
                    });
                } else {
                    var botVC = parseInt(connection.channelID, 10);
                    var memberVC = parseInt(voiceChannel, 10);
                    console.log(botVC);
                    console.log(memberVC);
                    if ( botVC == memberVC ) {
                        connection.stopPlaying();

                    } else {
                        bot.createMessage(textChannel, {
                            embed: {
                                description: `Must be connected to VC to skip.`
                            }
                        });
                    }
                }
                
                break;
            
            case 'p':
            case 'play':
                if ( args.length > 0 ){
                    if ( ytdl.validateURL(args[0])){
                        connection = bot.voiceConnections.find(conn => conn.id === msg.guildID);
                        if ( !connection ) { // join vc
                            join( textChannel, msg.member, args[0] );
                        } else { // play song
                            q.enqueue(args[0]);
                            play( connection, textChannel, msg.member );
                        }
                    } else {
                        bot.createMessage(textChannel, {
                            embed: {
                                description: `Invalid URL : ${args[0]}.`
                            }
                        });
                    }
                    
                } else {
                    bot.createMessage(textChannel, {
                        embed: {
                            description: `No URL specified.`
                        }
                    });
                }
                
                break;
        }
    }
    
});

async function bubble( textChannel ) {

}

async function remove( textChannel, n ) {
    const removed = q.remove(n);
    var info = await ytdl.getBasicInfo(removed);

    bot.createMessage(textChannel, {
        embed: {
            description: `Removed [${info.videoDetails.title}](${removed}) from the queue.`
        }
    });
}

async function showQueue( textChannel ) {
    var message = ``;

    for ( i = 0; i < q.size(); i++ ) {
        var info = await ytdl.getBasicInfo(q.get(i));
        message += `${i+1}: [${info.videoDetails.title}](${q.get(i)})\n`;
        
    }
    bot.createMessage(textChannel, {
        embed: {
            title: "Queue",
            description: message
        }
    });
}

async function join( textChannel, member, url) {
    var voiceChannel = member.voiceState.channelID;

    if ( voiceChannel != null ) {
        q.enqueue(url);
        connection = await bot.joinVoiceChannel(voiceChannel);
        play( connection, textChannel );

        connection.on('end', () => {
            if ( !q.isEmpty() ){
                play( connection, textChannel );
            } else {
                bot.leaveVoiceChannel(connection.channelID);
            }
        })

    } else {
        bot.createMessage(textChannel, {
            embed: {
                description: `Join a voice channel to play music.`
            }
        });
    }
}

async function play( connection, textChannel ) {
    if( !connection.playing ) {
        const info = await ytdl.getBasicInfo(q.peek());

        bot.createMessage(textChannel, {
            embed: {
                description: `Now playing: [${info.videoDetails.title}](${q.peek()})`
            }
        });
        const stream = ytdl(q.peek(), {filter: "audioonly"}).on('response', () => {
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
        const info = await ytdl.getBasicInfo(q.end());
        bot.createMessage(textChannel, {
            embed: {
                description: `Queued [${info.videoDetails.title}](${q.end()})`
            }
        });
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

Queue.prototype.remove = function (n) {
    return this.elements.splice(n-1, 1);
}

Queue.prototype.clear = function () {
    this.elements = [];
}

Queue.prototype.get = function (n) {
    return this.elements[n];
}

Queue.prototype.size = function () {
    return this.elements.length;
}


bot.connect();
