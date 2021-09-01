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
                if ( q.isEmpty() ) {
                    bot.createMessage(textChannel, `\`\`\`Queue is empty.\`\`\``);
                } else {
                    showQueue(textChannel);
                }
                
                break;
            
            case 'remove': // remove specific song from queue
                if ( q.isEmpty() ) {
                    bot.createMessage(textChannel, `\`\`\`Queue is empty\`\`\``);
                    break;
                }
                var num = parseInt(args[0], 10);
                console.log(num);
                if ( isNaN(num) || num < 1 || q.size() < num ) {
                    bot.createMessage(textChannel, `\`\`\`Can't remove that from the queue\`\`\``);
                } else {
                    remove(textChannel, num);
                }
                break;
            
            case 'skip':
                connection = bot.voiceConnections.find(conn => conn.id === msg.guildID);
                var voiceChannel = msg.member.voiceState.channelID;
                if ( !connection ) {
                    bot.createMessage(textChannel, `\`\`\`Not playing music rn.\`\`\``);
                } else {
                    var botVC = parseInt(connection.channelID, 10);
                    var memberVC = parseInt(voiceChannel, 10);
                    console.log(botVC);
                    console.log(memberVC);
                    if ( botVC == memberVC ) {
                        connection.stopPlaying();

                    } else {
                        bot.createMessage(textChannel, `\`\`\`Must be connected to VC to skip.\`\`\``);
                    }
                }
                
                break;
            
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
                        bot.createMessage(textChannel, `\`\`\`Invalid URL : ${args[0]}.\`\`\``);
                    }
                    
                } else {
                    bot.createMessage(textChannel, `\`\`\`No URL specified.\`\`\``);
                }
                
                break;
        }
    }
    
});

async function remove( textChannel, n ) {
    const removed = q.remove(n);
    var info = await ytdl.getBasicInfo(removed);

    bot.createMessage(textChannel, `\`\`\`ini\nRemoved [ ${info.videoDetails.title} ] from the queue.\`\`\``);
}

async function showQueue( textChannel ) {
    var message = `\`\`\`ini\nQueue:`;

    for ( i = 0; i < q.size(); i++ ) {
        var info = await ytdl.getBasicInfo(q.get(i));
        message += `\n${i+1}: [${info.videoDetails.title}]`;
        
    }
    message += `\`\`\``;
    bot.createMessage(textChannel, message);
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
        bot.createMessage(textChannel, 'You must be in a voice channel to play a song.');
    }

    
}


async function play( connection, textChannel ) {
    if( !connection.playing ) {
        const info = await ytdl.getBasicInfo(q.peek());
        
        bot.createMessage(textChannel, `\`\`\`ini\nNow playing: [ ${info.videoDetails.title} ]\`\`\``);
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
        bot.createMessage(textChannel, `\`\`\`ini\nQueued [ ${info.videoDetails.title} ]\`\`\``);
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

Queue.prototype.get = function (i) {
    return this.elements[i];
}

Queue.prototype.size = function () {
    return this.elements.length;
}


bot.connect();
