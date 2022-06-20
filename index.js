// Importing libraries needed
import fetch from 'node-fetch';
import fs from 'fs';

// Variables used to store worker results
let mixedReport = {};
let issueReport = {};
let noIssueReport = {};

// Variables defined by user in start script (package.json).
const WORKER_PATH = filter_options('--path');
const FILENAME = filter_options('--filename');
const REPORT_TYPE = filter_options('--report_type');



/**
 * Core part of program. Runs sites through checks and then
 * compiles stats. And builds formatted .json file with the 
 * granular results.
 * 
 * @param {callback} callback Returns that the program has finished. Or errored out.
 */
function main(callback){
    if(typeof callback!='function') callback=function(){};

    // (sites) comes from a hardcoded array at bottom of file.
    // Future: Update to pull from DB or read in a file.
    recursively_check_worker_files([...sites], WORKER_PATH, 
        (onComplete) => {
            // Check for an error. (comes as a string with "Error" **Cant be an Object** )
            if(typeof onComplete !== 'object' && onComplete.includes('Error')){
                console.log(onComplete);
                return;
            }
            console.log(`recursively_check_worker_files COMPLETE: (${WORKER_PATH})`);

            // Clean up and stats...
            let noIssueCount = 0;
            for(var aimtell_id in mixedReport){
                for(var issue in mixedReport[aimtell_id].issues){
                    let msg = mixedReport[aimtell_id].issues[issue].msg;
                    if(msg.includes('No issues')){
                        // No Issue
                        noIssueCount++;
                        if(!noIssueReport[aimtell_id]) noIssueReport[aimtell_id] = mixedReport[aimtell_id];
                    }
                    else{
                        // Has Issue...
                        if(!issueReport[aimtell_id]) issueReport[aimtell_id] = mixedReport[aimtell_id];
                    }
                }
            }

            // Write to file based on information desired in report.
            let readyToSave = {issues:issueReport,no_issues:noIssueReport,full:mixedReport};
            switch (REPORT_TYPE) {
                case 'issues':
                    delete readyToSave.full;
                    delete readyToSave.no_issues;
                    break;
                case 'no_issues':
                    delete readyToSave.full;
                    delete readyToSave.issues;
                    break;
            }
            var jsonContent = JSON.stringify(readyToSave);
            fs.writeFile(FILENAME, jsonContent, 'utf8', function (err) {
                if (err) {
                    console.log("An error occured while writing JSON Object to File.");
                    return callback();
                }

                // Summary
                console.log(`(${FILENAME}) File has been saved.`);
                console.log("Number Of Domains Checked: " + sites.length);
                console.log("Number Of Domains in Report: " + Object.keys(mixedReport).length);
                console.log("Number Of Issue Free Domains: " + noIssueCount);
                console.log("Number Of Domains with Issues: " + (Object.keys(mixedReport).length - noIssueCount));
                return callback();
            });
        }, 
        (onProgress) => {
            console.log(`PROGRESS: (${WORKER_PATH}) ${onProgress}`);
        }
    );
}



/**
 * Begins recurisively slicing off sites. And sending them to get 
 * their worker files inspected at given location.
 * 
 * @param {Array} sites List of objects [{id:12345,url:'https://google.com},...{},{},...{}].
 * @param {String} workerPath Url path where we will inspect the worker file.
 * @param {callback} onComplete Return final response. Made it through all sites. Or errored out.
 * @param {callback} onProgress Status update on where we are in the process (List of sites).
 */
function recursively_check_worker_files(sites, workerPath, onComplete, onProgress){
    if(typeof onComplete!='function') onComplete=function(){};
    if(typeof onProgress!='function') onProgress=function(){};

    // Check for a supplied worker path to check on each domain
    if(workerPath==null) return onComplete('Error: Must include... argv[2]');

    // Return now that all sites have been checked
    if(sites.length == 0) return onComplete({msg:'No sites left to check', sites:sites});
    let site = sites[0];
    sites.shift();

    check_worker_file(site, workerPath, response =>{
        let worker = response;
        console.log(worker);

        // Return progress update
        onProgress(site.url);
        // Recursively call the next site
        recursively_check_worker_files(sites, workerPath, onComplete, onProgress);
    });

}



/**
 * Inpects worker file at desired URL path. Adds any issues it finds to object and
 * passes that information up. Also denotes files with no issues.
 * 
 * @param {Object} site Contains site identifying information like id, and url.
 * @param {String} workerPath Url path where we will inspect the worker file.
 * @param {callback} callback Returns marking we have inspected data on worker file.
 */
function check_worker_file(site, workerPath, callback){
    if(typeof callback!='function') callback=function(){};

    let options = { 
        method: 'GET',
        timeout: 1000,
        url: `https://${extractHostname(site.url)}${workerPath}`
    };
    fetch_url(options, (data) => {
        if (data.error) {
            console.log(data.error); 
        }
        let response = data;
        let body = response.body;

        let issues = [];		
        if(response.statusCode == 200 && (response.headers.includes('javascript'))) {
            if(body.includes(`importScripts('https://cdn.aimtell.com/sdk/aimtell-worker-sdk.js');`)){
                let obj = {
                    msg:`${options.url}... No issues! HAS [importScripts('https://cdn.aimtell.com/sdk/aimtell-worker-sdk.js');]`
                };
                issues.push(obj);
            }
            else{
                let obj = {
                    msg:`${options.url}... Missing [importScripts('https://cdn.aimtell.com/sdk/aimtell-worker-sdk.js');]`
                };
                issues.push(obj);
            }

            if(body.includes(`pushly`)){
                let obj = {
                    msg:`${options.url}... Using (another service)`
                };
                issues.push(obj);
            }

            if(!mixedReport[site.id]) mixedReport[site.id] = {};
            mixedReport[site.id].domain = site.url;
            mixedReport[site.id].issues = issues;
            callback(options.url);
        }
        // Fetch request failed
        else{

            // Return specific error found by the fetch request.
            if(response.error){
                let obj = {
                    msg:`${options.url}... There is an error on this page (${response.error.code})`
                };
                issues.push(obj);

                if(!mixedReport[site.id]) mixedReport[site.id] = {};
                mixedReport[site.id].domain = site.url;
                mixedReport[site.id].issues = issues;    
                return callback(options.url);
            }

            // No specific error was found. So go through list of other issues.
            if(body.includes(`NoSuchBucket`) || body.includes(`bucket does not exist`)){
                let obj = {
                    msg:`${options.url}... This path does not exist (NoSuchBucket) error`
                };
                issues.push(obj);
            }  
            else{ // Generic issue...
                let obj = {
                    msg:`${options.url}... Dead Site`
                };
                issues.push(obj);
            }

            if(!mixedReport[site.id]) mixedReport[site.id] = {};
            mixedReport[site.id].domain = site.url;
            mixedReport[site.id].issues = issues;
            callback(options.url);
		}
    });
}



/**
 * Normalizes Domain / Hostname of site given.
 * @param {String} url Normalizes Domain / Hostname of site we are inspecting.
 */
function extractHostname(url) {
    var hostname;

    // Find & remove protocol (http, ftp, etc.) and get hostname
    if (url.indexOf("//") > -1)
        hostname = url.split('/')[2];
    else
        hostname = url.split('/')[0];

    // Find & remove port number
    hostname = hostname.split(':')[0];
    // Find & remove "?"
    hostname = hostname.split('?')[0];
    return hostname;
}



/**
 * Reaches out to the specified url and grabs the data. The
 * data contains various information about the request status. And 
 * the content on that page.
 * 
 * @param {Object} options Options for fetch (node-fetch)
 * @param {callback} callback Returns once we fetched data from desired url.
 */
function fetch_url(options, callback){
	if(typeof callback!='function') callback=function(){};
	// console.log('opts fetch');
    // console.log(options);
    
	let response = {};
	fetch(options.url,options)
		.then(res => {
			response.ok = res.ok;
			response.statusCode = res.status;
			response.statusText = res.statusText;
			response.headers = res.headers.get('content-type');
			response.lastModifed = res.headers.get('last-modified');
			res.text()
				.then(data=>{
					response.body = data;
					callback(response);
					return;
				})
				.catch(err => {
                    response.error = err;
                    console.log(err);
					callback(response);
				})
		})
		.catch(err2 => {
            response.error = err2;
            console.log(err2);
			callback(response);
		})
	;
}



/**
 * Takes desired option and looks for it in the array of arguments
 * provided by npm script. Then based on desired option formats
 * and returns a valid option.
 * 
 * @param {String} option Desired option to look for in arguments provided by npm script. 
 */
function filter_options(option){
    if(!option) return null;

    // Loop through arguments provided by npm script
    for(var i in process.argv){
        let r_option = process.argv[i];

        if(r_option.includes(option) && option.includes('--path')){
            return r_option.split('=')[1];
        }
        else if(r_option.includes(option) && option.includes('--filename')){
            let raw_option = r_option.split('=')[1];
            return r_option.split('=')[1];
        }
        else if(r_option.includes(option) && option.includes('--report_type')){
            return r_option.split('=')[1];
        }
    }

    // Now provide defaults in case this desired option needs one
    if(option.includes('--filename')){
        if(WORKER_PATH!=null) return 'worker_report(' + WORKER_PATH.slice(1) + ').json';
        return 'worker_report.json';
    }
    else if(option.includes('--report_type')){
        return 'full';
    }

    return null;
}



// Data that will be fed through the program.
// All other future data passed here must follow a similar data structure.
let sites = [
    {
      "id": 25246,
      "url": "https://www.directhit.com/"
    },
    {
      "id": 25247,
      "url": "https://www.fastquicksearch.com/"
    },
    {
      "id": 25248,
      "url": "https://www.smarter.com/"
    },
    {
      "id": 25249,
      "url": "https://www.chaseafterinfo.com/"
    },
    {
      "id": 25250,
      "url": "https://www.productopia.com/"
    },
    {
      "id": 25251,
      "url": "https://www.nowtopresults.com"
    },
    {
      "id": 25252,
      "url": "https://www.allshoppinghub.com/"
    },
    {
      "id": 25253,
      "url": "https://www.searchresultsdelivery.com/"
    },
    {
      "id": 25254,
      "url": "https://www.resultsdistributor.com/"
    },
    {
      "id": 25255,
      "url": "https://www.holidaygiftssearch.com/"
    },
    {
      "id": 25256,
      "url": "https://findsmartresults.com/"
    },
    {
      "id": 25257,
      "url": "https://www.siftforresults.com/"
    },
    {
      "id": 25258,
      "url": "https://www.wefindanswers.co/"
    },
    {
      "id": 25259,
      "url": "https://www.smartshopresults.com/"
    },
    {
      "id": 25260,
      "url": "https://www.discoverresultsfast.com/"
    },
    {
      "id": 25261,
      "url": "https://findresultsquickly.com/"
    },
    {
      "id": 25263,
      "url": "https://www.stumbleuponresults.com/"
    },
    {
      "id": 25338,
      "url": "https://allinfosearch.com"
    },
    {
      "id": 25339,
      "url": "https://allresultsweb.com"
    },
    {
      "id": 25340,
      "url": "https://allsearchsite.com"
    },
    {
      "id": 25367,
      "url": "https://www.websearch101.com/"
    },
    {
      "id": 25368,
      "url": "https://www.travelsearchexpert.com/"
    },
    {
      "id": 25369,
      "url": "https://www.topwebanswers.com/"
    },
    {
      "id": 25370,
      "url": "https://www.topwealthinfo.com/"
    },
    {
      "id": 25371,
      "url": "https://www.topsearch.co/"
    },
    {
      "id": 25372,
      "url": "https://www.top10answers.com/"
    },
    {
      "id": 25373,
      "url": "https://www.theresultsengine.com/"
    },
    {
      "id": 25374,
      "url": "https://www.theanswerhub.com/"
    },
    {
      "id": 25375,
      "url": "https://www.teoma.us/"
    },
    {
      "id": 25376,
      "url": "https://www.superdealsearch.com/"
    },
    {
      "id": 25377,
      "url": "https://www.smartsearchresults.com/"
    },
    {
      "id": 25378,
      "url": "https://www.smartanswersonline.com/"
    },
    {
      "id": 25379,
      "url": "https://search.sidewalk.com/"
    },
    {
      "id": 25380,
      "url": "https://www.shopping.net/"
    },
    {
      "id": 25381,
      "url": "https://www.shop411.com/"
    },
    {
      "id": 25382,
      "url": "https://www.searchstartnow.com/"
    },
    {
      "id": 25383,
      "url": "https://www.searchresultsfast.com/"
    },
    {
      "id": 25384,
      "url": "https://www.searchonlineinfo.com/"
    },
    {
      "id": 25385,
      "url": "https://www.searchitweb.com/"
    },
    {
      "id": 25386,
      "url": "https://www.searchinfotoday.com/"
    },
    {
      "id": 25387,
      "url": "https://www.searchinfonow.com/"
    },
    {
      "id": 25388,
      "url": "https://www.searchandshopping.org/"
    },
    {
      "id": 25389,
      "url": "https://search.tb.ask.com"
    },
    {
      "id": 25390,
      "url": "https://search.myway.com"
    },
    {
      "id": 25393,
      "url": "https://www.search-hq.com/"
    },
    {
      "id": 25394,
      "url": "https://www.safesearch.ask.com/"
    },
    {
      "id": 25395,
      "url": "https://www.quickresultsnow.com/"
    },
    {
      "id": 25396,
      "url": "https://www.allwealthinfo.com/"
    },
    {
      "id": 25397,
      "url": "https://www.quicklyseek.com/"
    },
    {
      "id": 25398,
      "url": "https://www.quicklyanswers.com/"
    },
    {
      "id": 25399,
      "url": "https://www.pronto.com/"
    },
    {
      "id": 25400,
      "url": "https://www.ohdeal.com/"
    },
    {
      "id": 25401,
      "url": "https://mywebsearch.com"
    },
    {
      "id": 25402,
      "url": "https://www.mysearchexperts.com/"
    },
    {
      "id": 25404,
      "url": "https://www.mydeal.io/"
    },
    {
      "id": 25405,
      "url": "https://www.answerroot.com/"
    },
    {
      "id": 25406,
      "url": "https://www.kensaq.com/"
    },
    {
      "id": 25407,
      "url": "https://www.autospath.com/"
    },
    {
      "id": 25408,
      "url": "https://www.justfindinfo.com/"
    },
    {
      "id": 25409,
      "url": "https://www.internetcorkboard.com/"
    },
    {
      "id": 25410,
      "url": "https://int.search.tb.ask.com"
    },
    {
      "id": 25411,
      "url": "https://www.candofinance.com/"
    },
    {
      "id": 25412,
      "url": "https://int.search.myway.com"
    },
    {
      "id": 25413,
      "url": "https://www.dailyguides.com/"
    },
    {
      "id": 25414,
      "url": "https://www.informationvine.com/"
    },
    {
      "id": 25415,
      "url": "https://www.digupinfo.com/"
    },
    {
      "id": 25416,
      "url": "https://index.reference.com/"
    },
    {
      "id": 25417,
      "url": "https://index.about.com/"
    },
    {
      "id": 25418,
      "url": "https://www.idealhomegarden.com/"
    },
    {
      "id": 25419,
      "url": "https://www.homeandgardenideas.com/"
    },
    {
      "id": 25420,
      "url": "https://www.govtsearches.com/"
    },
    {
      "id": 25421,
      "url": "https://www.getsearchinfo.com/"
    },
    {
      "id": 25422,
      "url": "https://www.finecomb.com/"
    },
    {
      "id": 25423,
      "url": "https://www.findthedish.com/"
    },
    {
      "id": 25424,
      "url": "https://www.findinfoquickly.com/"
    },
    {
      "id": 25425,
      "url": "https://www.findinfoonline.com/"
    },
    {
      "id": 25426,
      "url": "https://www.findhealthinfonow.com/"
    },
    {
      "id": 25427,
      "url": "https://www.fastsearchresults.com/"
    },
    {
      "id": 25428,
      "url": "https://www.everymantravel.com/"
    },
    {
      "id": 25429,
      "url": "https://www.everymanbusiness.com/"
    },
    {
      "id": 25430,
      "url": "https://www.etour.com/"
    },
    {
      "id": 25431,
      "url": "https://www.discoverhealthinfo.com/"
    },
    {
      "id": 25432,
      "url": "https://avira.ask.com"
    },
    {
      "id": 25446,
      "url": "https://findbestresults.co"
    },
    {
      "id": 25636,
      "url": "https://www.bloglines.com/"
    },
    {
      "id": 25640,
      "url": "https://ask.com"
    },
    {
      "id": 25642,
      "url": "https://www.symptomfind.com"
    },
    {
      "id": 25648,
      "url": "https://www.life123.com"
    },
    {
      "id": 25649,
      "url": "https://www.askmoney.com"
    },
    {
      "id": 25650,
      "url": "https://www.reference.com"
    },
    {
      "id": 25651,
      "url": "https://www.askdailyquiz.com"
    },
    {
      "id": 25653,
      "url": "https://www.simpli.com"
    },
    {
      "id": 25654,
      "url": "https://www.questionsanswered.net"
    },
    {
      "id": 25655,
      "url": "https://www.faqtoids..com"
    },
    {
      "id": 25656,
      "url": "https://www.consumersearch.com"
    }
  ];



/**
 * Run the program...
 */
main();