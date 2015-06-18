"use strict";

var fs = require("fs");
var path = require("path");
var url = require("url");
var http = require("http");
var https = require("https");
var util = require("util");

var apiurl_branches = "https://api.github.com/repos/%s/%s/branches";
var apiurl_forks = "https://api.github.com/repos/%s/%s/forks";

var target_username = process.argv[2];
var target_repo = process.argv[3];
var maximum_forks = process.argv[4] || 32;

if (!target_username || !target_repo) {
    console.log("Usage: " + process.argv[0] + " user repo [maxforks]");
    console.log("Avoid API limits by placing a Personal Access Token in ./.ghtoken with the");
    console.log("format <username>:<token>");
    console.log("Create one here: https://github.com/settings/tokens");
    if (require.main === module) {
        process.exit(1);
    }
}

var api_token;
var api_token_path;
if (fs.existsSync("./.ghtoken")) {
    api_token_path = "./.ghtoken";
} else if (fs.existsSync("~/.ghtoken")) {
    api_token_path = "~/.ghtoken";
} else if (fs.existsSync(path.resolve(__dirname, ".ghtoken"))){
    api_token_path = fs.existsSync(path.resolve(__dirname, ".ghtoken"));
}

if (api_token_path) {
    api_token = fs.readFileSync(api_token_path, {encoding: "utf8"});
    api_token = api_token.replace(/[\n\t\r]/g, "");
}

var origin_branches = [];

printInterestingForks();

function printInterestingForks(){
    //Get origin branches
    getBranches(target_username, target_repo, function(branches){
        origin_branches = branches;
        //console.log("origin branches: "+JSON.stringify(origin_branches));
        getForkBranches(target_username, target_repo, function(forks){
            forks = forks.sort(function(a, b){
                return new Date(b.pushed_at) - new Date(a.pushed_at);
            });
            
            forks = forks.slice(0, maximum_forks);

            iterateForks(forks);
        });
    });
}

function iterateForks(forks){
    if (forks.length > 0) {
        var fork = forks[0];

        console.info(fork.html_url);
        process.stdout.write("Interesting branches: ");

        getBranches(fork.owner.login, fork.name, function(branches){
            printInterestingBranches(branches, origin_branches, function(){
                console.info("");
                iterateForks(forks.slice(1));
            });
        });
    }
}

function getForkBranches(username, repo, callback) { // (and sort them by last push date, descending)
    var target_url = util.format(apiurl_forks, username, repo);
    followJSONpages(target_url, callback);
}

function printInterestingBranches(branches, exclude_branches, callback) {
    //This will break if github stops returning branch names in alaphalabeletical order
    for (var i_origin = 0, i_fork = 0; i_fork < branches.length; i_fork++) {
        while (exclude_branches[i_origin] < branches[i_fork]) {
            i_origin++;
        }
        if (exclude_branches[i_origin] > branches[i_fork] || i_origin >= exclude_branches.length) {
            process.stdout.write(branches[i_fork] + " ");
        }
    }
    console.info("");
    if (callback) {
        callback();
    }
}

function getBranches(repo_owner, repo_name, callback) {
    var target_url = util.format(apiurl_branches, repo_owner, repo_name);
    followJSONpages(target_url, function(data){
        var branches = [];
        for (var branch in data) {
            branches.push(data[branch].name);
        }
        callback(branches);
    });

}

function followJSONpages(target_url, callback, json_data) {
    json_data = json_data ? json_data : [];
    var parsed_url = url.parse(target_url);
    var options = {
        hostname: parsed_url.hostname,
        port: parsed_url.port,
        path: parsed_url.path,
        headers: {"User-Agent": "list-github-forks"}
    };
    if (api_token && api_token.length > 0) {
        options.auth = api_token;
    }
    //console.log("options: "+JSON.stringify(options));
    var http_maybe_s = parsed_url.protocol === "https:" ? https : http;
    var req = http_maybe_s.request(options, function(res){
        var body = "";
        res.on("data", function(chunk){
            //It'd be nice to have a stream parser here
            body += chunk;
        });

        if(res.statusCode === 200) {
            res.setEncoding("utf8");
            res.on("end", function(){
                json_data = json_data.concat(JSON.parse(body));
                //console.log("headers: "+JSON.stringify(res.headers));
                if (res.headers.link) {
                    var links = processLinkHeader(res.headers.link);
                    if (links.next) {
                        //console.log("follow " + links.next);
                        setTimeout(function(){followJSONpages(links.next, callback, json_data);}, 50);
                    } else {
                        //console.log("callback!");
                        callback(json_data);
                    }
                } else {
                    //console.log("callback!");
                    callback(json_data);
                }
            });

        } else {
            res.on("end", function(){
                throw "HTTP error " + res.statusCode + " " + res.statusMessage + " while fetching " + target_url + ": " + body;
            });
        }
    });
    req.end();
}

function processLinkHeader(value){
    var re_csv = /(<[^<>]+>[^,]+)(,|$)/g;
    var re_linkparts = /<([^<>]+)>;\s*rel="([^"]+)"/;

    var links = {};

    var link;
    while ((link = re_csv.exec(value)) !== null) {
        var link_parts = link[1].match(re_linkparts);
        if (link_parts.length >= 3) {
            links[link_parts[2]] = link_parts[1];
        } else {
            console.log("Didn't understand a Link header: " + link);
        }
    }

    return links;
}


//ad-hoc tests

function test_printInterestingBranches() {
    printInterestingBranches(["abranch", "boring", "feature", "master", "optimize", "whatever", "zinteresting"],
                            ["boring", "master", "whatever"]);
}

function test_processLinkHeaders() {
    var assert = require("assert");
    var links = processLinkHeader('<https://example.com/wh,at?page=2>; rel="next", <https://example.com/?page=64>; rel="last"');
    assert.deepEqual(links, {next:"https://example.com/wh,at?page=2", last:"https://example.com/?page=64"});
}

function test_loadJSON(){
    var assert = require("assert");
    followJSONpages("http://www.zone42.ca/~philippe/cake.json", function(data){
        assert.deepEqual(data,[{"name":"Toroid cake"},{"name":"rawberry cake"},{"name":"that's way too much meringue"}]);
    });
}

function test_followJSONpages(){
    var assert = require("assert");
    followJSONpages("http://localhost:8666", function(data){
        assert.deepEqual(data,[{"name":"Genesis cake"},{"name":"Toroid cake"},{"name":"rawberry cake"},{"name":"that's way too much meringue"}]);
        console.log("test_followJSONpages: " + JSON.stringify(data));
    });
    /* nc -l 8666 -k
HTTP/1.1 200 OK
Link: <http://www.zone42.ca/~philippe/cake.json>; rel="next"

[{"name":"Genesis cake"}]
     */
}
