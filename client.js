var express = require("express");
var request = require("sync-request");
var url = require("url");
var qs = require("qs");
var querystring = require('querystring');
var cons = require('consolidate');
var randomstring = require("randomstring");
var __ = require('underscore');
__.string = require('underscore.string');
var faye = require('faye');
const e = require("express");


var app = express();

app.engine('html', cons.underscore);
app.set('view engine', 'html');
app.set('views', 'files/client');

// authorization server information
var authServer = {
	authorizationEndpoint: 'https://login.salesforce.com/services/oauth2/authorize',
	tokenEndpoint: 'https://login.salesforce.com/services/oauth2/token'
};

// client information

var client = {
	//"client_id": "3MVG9zlTNB8o8BA14VHFBTKqVeUzLwEpWqRc..CSJ_imd.Ef.Tyxr6dkyLN.jO5OAyiRy2sJHbPZwxwlLOb6B",
	//"client_secret": "1771474221795058741",
	//"redirect_uris": ["https://oauthtosalesforce.herokuapp.com/Callback"]
	"client_id": "3MVG9zlTNB8o8BA14VHFBTKqVecwDEuy_.Zs2UiL1PSaHM3JOJNoTTIwN3e3huImaCY150QiPKw1BDjPGM5hr",
	"client_secret": "B9C16EAD70D9516180A30789CC43A8152AF6A9176F04759235DB8231D7D75799",
	"redirect_uris": ["http://localhost:9000/Callback"]
};

var state = 'abc';

var access_token = null;
var scope = null;
var refresh_token = null;
var instanceURL = null;
var theMessage = 'None';

app.get('/', function (req, res) {
	res.render('index', {access_token: access_token, scope: scope, refresh_token: refresh_token});
});

app.get('/authorize', function(req, res){

	access_token = null;
	scope = null;
	//state = randomstring.generate()
	
	var authorizeUrl = buildUrl(authServer.authorizationEndpoint, {
		response_type: 'code',
		//response_type: 'token',
		client_id: client.client_id,
		redirect_uri: client.redirect_uris[0],
		state: state
	});
	
	console.log("redirect", authorizeUrl);
	res.redirect(authorizeUrl);
	return;
});

app.get('/Callback', function(req, res){
	
	console.log('In Callback');
	
	if (req.query.error) {
		// it's an error response, act accordingly
		res.render('error', {error: req.query.error});
		return;
	}
	
	//var resState = req.query.state;
	//if (resState != state) {
	//	console.log('State DOES NOT MATCH: expected %s got %s', state, resState);
	//	res.render('error', {error: 'State value did not match'});
	//	return;
	//}

	var code = req.query.code;
	console.log('a token=' + code);
	console.log(req.params);

	var form_data = qs.stringify({
				grant_type: 'authorization_code',
				code: code,
				redirect_uri: client.redirect_uris[0]
			});
	var headers = {
		'Content-Type': 'application/x-www-form-urlencoded',
		'Authorization': 'Basic ' + new Buffer(querystring.escape(client.client_id) + ':' + querystring.escape(client.client_secret)).toString('base64')
	};

	var tokRes = request('POST', authServer.tokenEndpoint, 
		{	
			body: form_data,
			headers: headers
		}
	);

	console.log('Requesting access token for code %s',code);
	
	if (tokRes.statusCode >= 200 && tokRes.statusCode < 300) {
		var body = JSON.parse(tokRes.getBody());
	
		access_token = body.access_token;
		console.log('Got access token: %s', access_token);
		if (body.refresh_token) {
			refresh_token = body.refresh_token;
			console.log('Got refresh token: %s', refresh_token);
		}
		
		scope = body.scope;
		console.log('Got scope: %s', scope);
		instanceURL = body.instance_url;
		console.log(instanceURL);
		//res.render('index', {access_token: access_token, scope: scope, refresh_token: refresh_token});
	} else {
		res.render('error', {error: 'Unable to fetch access token, server response: ' + tokRes.statusCode})
	}
	res.render('index', {access_token: code, scope: scope, refresh_token: refresh_token});
	return;
});

app.get('/subscribe', function(req, res) {
	console.log('In subscribe');
	var client       = new faye.Client(instanceURL + '/cometd/48.0/');
	client.setHeader('Authorization', 'OAuth ' + access_token);
	try {
		client.subscribe('/event/Test_From_Node__e', function(message) {
			console.log('Event occured');
			console.log(message);
			//res.render('index', {access_token: '', scope: '', refresh_token: '', show_Message: 'We subscribed'});
			return;
		});
	
	} catch (e) {
		console.log('Broken: ' + e.message());
	}
	res.render('index', {access_token: '', scope: '', refresh_token: ''});
	return;
});

app.get('/subscribeCDC', function(req, res) {
	console.log('In subscribe change data capture');
	var client       = new faye.Client(instanceURL + '/cometd/48.0/');
	client.setHeader('Authorization', 'OAuth ' + access_token);
	try {
		client.subscribe('/data/ChangeEvents', function(message) {
			console.log('Event occured');
			console.log(message);
			console.log(message.payload.ChangeEventHeader.commitUser);
			var changedFields = message.payload.ChangeEventHeader.changedFields;
			console.log(changedFields);
			//res.render('index', {access_token: '', scope: '', refresh_token: '', show_Message: 'We subscribed'});
			return;
		});
	
	} catch (e) {
		console.log('Broken: ' + e.message());
	}
	res.render('index', {access_token: '', scope: '', refresh_token: ''});
	return;
});


app.get('/createAccount', function(req, res) {
	var accountheader = {
		'Content-Type': 'application/json',
		'Authorization': 'Bearer ' + access_token 
	};
	var jsonBody = '{"Name": "Danny Test account from Node for Craig.js"}';
	var postIT = request('POST', instanceURL + '/services/data/v43.0/sobjects/Account/', {
		body: jsonBody,
		headers: accountheader
	});
	if (postIT.statusCode >= 200 && postIT.statusCode < 300) {
		var body = JSON.parse(postIT.getBody());
		console.log(body.id);
		res.render('index', {access_token: access_token, scope: scope, refresh_token: refresh_token});
} else {
		console.log('Unable to create account, server response: ' + postIT.statusCode);
		res.render('error', {error: 'Unable to create account, server response: ' + postIT.statusCode})
	};
});

var refreshAccessToken = function(req, res) {
	var form_data = qs.stringify({
		grant_type: 'refresh_token',
		refresh_token: refresh_token
	});
	var headers = {
		'Content-Type': 'application/x-www-form-urlencoded',
		'Authorization': 'Basic ' + encodeClientCredentials(client.client_id, client.client_secret)
	};
	console.log('Refreshing token %s', refresh_token);
	var tokRes = request('POST', authServer.tokenEndpoint, {	
			body: form_data,
			headers: headers
	});
	if (tokRes.statusCode >= 200 && tokRes.statusCode < 300) {
		var body = JSON.parse(tokRes.getBody());

		access_token = body.access_token;
		console.log('Got access token: %s', access_token);
		if (body.refresh_token) {
			refresh_token = body.refresh_token;
			console.log('Got refresh token: %s', refresh_token);
		}
		scope = body.scope;
		console.log('Got scope: %s', scope);
	
		// try again
		res.redirect('/fetch_resource');
		return;
	} else {
		console.log('No refresh token, asking the user to get a new access token');
		// tell the user to get a new access token
		refresh_token = null;
		res.render('error', {error: 'Unable to refresh token.'});
		return;
	}
};

var buildUrl = function(base, options, hash) {
	var newUrl = url.parse(base, true);
	delete newUrl.search;
	if (!newUrl.query) {
		newUrl.query = {};
	}
	__.each(options, function(value, key, list) {
		newUrl.query[key] = value;
	});
	if (hash) {
		newUrl.hash = hash;
	}
	console.log(url.format(newUrl));
	return url.format(newUrl);
};

var encodeClientCredentials = function(clientId, clientSecret) {
	return new Buffer(querystring.escape(clientId) + ':' + querystring.escape(clientSecret)).toString('base64');
};

app.use('/', express.static('files/client'));

var server = app.listen(process.env.PORT || 9000, function () {
  var host = server.address().address;
  var port = server.address().port;
  console.log('OAuth Client is listening at http://%s:%s', host, port);
});
 
