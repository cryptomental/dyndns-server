const express = require('express');
const rateLimit = require('express-rate-limit');
const EthCrypto = require('eth-crypto');

// Load configuration
const config = require('./config');
const nsupdate = require('./util/nsupdate');

var app = express();

app.enable("trust proxy"); // Trust our NGINX
 
const limiter = rateLimit({
  windowMs: parseInt(config.limit_window) * 60 * 1000, // 
  max: parseInt(config.limit_rate) // limit each IP to N requests 
});
 
// Apply the limit to all requests
app.use(limiter);

app.get('/', async function (req, res) {
    var address = req.query.address;
    var timestamp = parseInt(req.query.timestamp,10);
    var threshold  = parseInt(config.time_threshold,10);
    var sig = req.query.sig;
    var signAddress = '0x0';
    const epoch = Math.floor((new Date).getTime() / 1000 );

    if (threshold >= timestamp ) console.log(`Warning: Threshold ${threshold} is bigger than timestamp.`);

    if (!timestamp && !sig && !address ) {
        res.status(200).send(config.message);
        return
    }

    if (!timestamp || !sig || !address ) {
        res.status(400).send("Missing parameter(s)");
        return
    }

    try {
        signAddress = EthCrypto.recover(sig,EthCrypto.hash.keccak256(timestamp.toString()));
    } catch (err){
        res.status(400).send(`${err}`);
        return
    }

    // Check if provided timestamp is in sync with us.
    const validTimestamp = ( epoch <= timestamp + threshold ) && ( epoch >= timestamp - threshold );
 
    if ( signAddress.toLowerCase() !== address.toLowerCase() ) {
        res.status(400).send("Invalid address or signature.");
    } else if (!validTimestamp) {
        res.status(400).send("Timestamp out of sync. Is your server syncronized?");
    } else {
        // Grab only first 8 chars of address as subdomain
        var subdomain = address.toLowerCase().substr(2).substring(0,8);
        var remoteIP = req.ip.includes(':') ? req.ip.split(':')[3] : req.ip
        try {
            var result = await nsupdate(config.bind_server, config.zone, subdomain, config.ttl, remoteIP);
            if (result) {
                res.status(200).send(`Your dynamic domain ${subdomain}.${config.zone} has been updated to ${remoteIP}`);
            }
        } catch (err){
            res.status(500).send(`Error on update: ${err}`);
        }
        
    }
});

app.listen(config.server.port, (err) => {
    if (err) {
		console.error(err.message);
		process.exit(1);
	}
    console.log(`Running on port ${config.server.port}...`);
});
