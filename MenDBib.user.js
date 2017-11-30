// ==UserScript==
// @name        MenDBib
// @author      Pamela M. Marcum
// @namespace   https://www.sharelatex.com/project
// @description Downloads latest Mendeley Web version of bibtex file from a shared group, cleans it, saves to Dropbox
// @include     https://www.sharelatex.com/project/*
// @require     https://ajax.googleapis.com/ajax/libs/jquery/3.2.1/jquery.min.js
// @require     https://code.jquery.com/jquery-migrate-3.0.1.js
// @require     https://apis.google.com/js/client.js?onload=handleClientLoad
// @match       https://www.sharelatex.com/project/
// @grant       GM_setValue
// @grant       GM_getValue
// @grant       GM_xmlhttpRequest
// @version     1.6
// @icon        https://i2.wp.com/mendbib.files.wordpress.com/2017/11/tm-icon.png?ssl=1&w=450
// @supportURL  https://mendbib.wordpress.com/contact/
// ==/UserScript==

/*--- OVERVIEW OF HOW THIS USERSCRIPT WORKS:
If user hits a button created by this script, s/he is transported to either a Mendeley Login
window to authorize use of this app with his/her Mendeley library, or a bibtex file is
immediately downloaded from the personal library, depending on whether or not the token
obtained from the last login is not active or is still active, respectively.  The button
is placed on any page whose URL starts with www.sharelatex.com/project. Helpful online info:
http://www.gethugames.in/2012/04/authentication-and-authorization-for-google-apis-in-
javascript-popup-window-tutorial.html
http://www.netlobo.com/url_query_string_javascript.html
hayageek.com/greasemonkey-tutorial.
Some of the GM_getResourceText stuff taken from
/groups.google.com/forum/#!topic/greasemonkey-users/o504w12bu6Y */

var chunkSize = 50; // can be made bigger, with loss of resolution in the status bar rendering
// chunkSize is #bib entries downloaded per chunk; smaller number increases resolution of status bar
// See its role below in call to Mendeley (the mendAPI);
var mendRedirect  = "https://www.sharelatex.com/project/";
var mendKey       = localStorage["mendKey"]; // the other userscript called mendbib_initialize puts these values into storage
if (!mendKey) { alert("Looks as if you have not yet run MenDBib_initialize"); }
var mendAuth      = "https://api.mendeley.com/oauth/authorize?";
var groupId       = localStorage["groupId"];
var mendAPI       = "https://api.mendeley.com/documents?view=bib&group_id="+groupId+"&limit="+chunkSize;
// See http://dev.mendeley.com/code/core_quick_start_guides.html#search-operators for example of above
var dbRedirect  = "https://www.sharelatex.com/project";
var dbKey         = localStorage["dbKey"];
var dbAuth        = "https://www.dropbox.com/oauth2/authorize?";
var bibFile       = "mendbib.bib";
var problemBib    = "mendbib_prob.bib";
var informationBib = "mendbib_info.README";
var dbApiBase     = "https://content.dropboxapi.com/2/files/";
// see https://www.dropbpx.com/developers-v1/core/docs#oa2-authorize; also see https://jsfiddle.net/seppe/eve5c72n
// https://stackoverflow.com/questions/41186899/script-to-read-write-a-file-that-is-
// stored-in-a-local-dropbox-folder-or-a-loca
var mendExpTime = 60; // expiration timescale for Mendeley token ... not sure, let's say it is an hour
var dbExpTime = 60;   // assume same token timescale of 60 mins for Dropbox, as well.
var barLength = 400; // length in pixels of the status bar while downloading/uploading data

// *****************************   USER BUTTON CREATION ****************************************
// Figure out if we should even have a button on the current page or not.  If the user is on ShareLaTex but
// NOT on a particular project page (for example, if the user is just looking at the list of projects at
// www.sharelatex.com/project), then this button should NOT appear.  The test is whether or not the URL
// has anything past the "project" part of the url.  Do the test:
var projMatch = /https:\/\/www.sharelatex.com\/project\/\S+/;
if (!iconImg) {var iconImg = getIcon(); } // loads up the MenDBib logo data to construct the button below
if (projMatch.test(document.location.href) && document.location.href.indexOf("access_token") == -1) {
// we are down in a project directory (there are characters to the right of "project" in the url, and we
// are not on the login redirect page), so present the button
    var input = document.createElement("img");
    input.setAttribute('id', 'MendbibIcon');
    input.setAttribute('src', iconImg);
    input.setAttribute("style", "position:absolute; bottom:20px; left:20px; height:50px;");
    input.onclick = loginAndGetAndWriteBib;
// Note:  interesting, if the above is "loginAndGetAndWriteBib()", ie with the () included, when the page
// loads up, it automatically starts executing the function loginAndGetAndWriteBib without any button-clicking.
// I am sure that years from now, when I better understand javascript, I will just laugh at the ignorance of
// this comment.
    document.body.appendChild(input);

// Now define the DropBox folder to place the bibtex in, for this ShareLatex paper:
// at the time of this writing, the delimiter separating the paper's title from some other words that construct
// the document title for the webpage is a dash symbol. Since the paper's title could also have a dash(s),
// figure out where the last dash is and keep all words to the left as the actual paper title:
    var delimTitle = " - ";
    var tmp = document.title.split(delimTitle);
    var docTitle = tmp[0];
    for (var i=1; i < tmp.length -1; i++) {docTitle = docTitle + delimTitle +tmp[i];}
    var dbFolder = "/Apps/ShareLatex/" + docTitle + "/";
}
// ///////////////////////////////////////// USERLOGIN ////////////////////////////////////////////
// This function is where the action initatied by the push of the "Update bibtex" button starts. This
// function first checks to determine the state of the Mendeley token (does it exist, or has user never
// logged in yet?  Has user logged in, but too long ago and token is no longer valid? If so, ask user
// to log in again by presenting the login window for either or both mendeley and dropbox.)
// Once login to both Mendeley and Dropbox have been verified, the tokens are used to download the bibtex
// from Mendeley using the Mendeley API, and then from there, Dropbox API is used to create a file on
// Dropbox using the bibtex content.
// ////////////////////////////////////////////////////////////////////////////////////////////////
function loginAndGetAndWriteBib() {
// clean up any status bars that are leftovers from a previous session that did not get wiped
   var b1 = document.getElementById("progressBar1");
   if (b1) {b1.parentNode.removeChild(b1); }//the progress bar exists, remove it
   var b2 = document.getElementById("progressBar2");
   if (b2) {b2.parentNode.removeChild(b2); }//the progress bar exists, remove it
   var b1 = document.getElementById("processBar");
   if (b1) {b1.parentNode.removeChild(b1); }//the progress bar exists, remove it
   var b1 = document.getElementById("uploadBar1");
   if (b1) {b1.parentNode.removeChild(b1); }//the progress bar exists, remove it
   var b2 = document.getElementById("uploadBar2");
   if (b2) {b2.parentNode.removeChild(b2); }//the progress bar exists, remove it

 // Check to see if there are any token information stored in Local Storage for Mendeley and Dropbox
    var mendTime = GM_getValue("StoredMendTime");
    var dbTime = GM_getValue("StoredDbTime");
// If there is nothing in storage, set the token acquisition times to zero.  A "zero" effectively means that
// the acquisition happened on Jan 1, 1970! (Plenty long enough ago so that the tokens are definitely expired!)
    if (!mendTime) {mendTime = 0;}   // If a token has never been saved in storage before, set mendTime to zero
    if (!dbTime) {dbTime = 0;}
// Check to see if the expiration times of the tokens are near expiration:
    if (!mendTime) {mendTime = 0;}   // If a token has never been saved in storage before, set mendTime to zero
    if (!dbTime) {dbTime = 0;}
    var now = new Date();
    var mendElapsed = (now.getTime() - mendTime)/(1000.0*60.0);  // in minutes
    var dbElapsed = (now.getTime() - dbTime)/(1000.0*60.0);
// If the elapsed time on the tokens is within 5 minutes of the time duration of the tokens, then call it close
// enough to need a fresh login to get a new token for either/both Mendeley and Dropbox

// First, see what the status is of the Mendeley login token.
    if (mendElapsed > (mendExpTime - 5.0) ) {  //mendeley token near or past expiration
        var site = "Mendeley";
// Generate a random 32-character string that is used for the "state" value, to identify and
// guard against cross-reference attacks
        for (var statestr = ''; statestr.length < 32;) statestr += Math.random().toString(36).substr(2,1);
        var apiKey = mendKey;
        var redirectUrl = mendRedirect;
        var authUrl = mendAuth;
        var storedStateName = "StoredMendState";
        var winLab = "Mendeley Login";
        var storedTokenName = "StoredMendToken";
        var storedTimeName = "StoredMendTime";
        var queryParams   = ["client_id="+apiKey,
                             "redirect_uri="+redirectUrl,
                             "response_type=token",
                             "scope=all",
                             "state=" + statestr];
    } else if (dbElapsed > (dbExpTime - 5.0) ) {  // Dropbox token near or past expiration
// Note that if BOTH Mendeley and Dropbox have expired tokens, the code will route the execution
// first assuming just Mendeley needs a token renewal.  This function will then be called again, by this
// function (a recursive call) and this second time through, the above "if" statement will be false but
// will fall through to this else if statement, where the condition will be "true" if the Dropbox token
// indeed needs refreshing.
	    var site = "Dropbox";
	    var statestr = ""+Math.floor(Math.random()*100000);
// The above taken from https://github.com/JamesMaroney/dropbox-js/blob/master/dropbox.js
        var apiKey = dbKey;
        var redirectUrl = dbRedirect;
        var authUrl = dbAuth;
        var storedStateName = "StoredDbState";
        var winLab = "Dropbox Login";
        var storedTokenName = "StoredDbToken";
	    var storedTimeName = "StoredDbTime";
        var queryParams   = ["client_id="+encodeURIComponent(apiKey),
                             "redirect_uri="+encodeURIComponent(redirectUrl),
                             "response_type=token",
                             "state=" + encodeURIComponent(statestr)];
    } else {var site = "AllClear";} // both Mendeley and Dropbox tokens are up-to-date

    if ( site != "AllClear" ) { // if either the Mendeley or Dropbox token is close or past expiration ...
// Store the generated value for later when comparing to the state returned by the redirect URL
        var query         = queryParams.join('&');
        var urlFull       = authUrl + query;
// Open up the popup window for logging in and authorizing MendBib to have access to Mendeley (or Dropbox):
        var win = window.open(urlFull, winLab, 'resizeable, scrollbars, status, width=800, height=480');
// The below is a "trick" that allows the detection of this popup window getting redirected to redirect_uri
// following successful log-in.  At the moment of redirect, the url will contain the token information, which
// will be stored for future calls to the API (to either download bibtex from Mendeley or to write the file
// on Dropbox).  What the below does is monitor the URL of the popup window (win.location.href) and when it
// it sees the token information ("access_token" is followed by a bunch of numbers that is the token), it
// then grabs the token information, stores in Local Storage, and closes the window.
        var pollTimer = setInterval(function() {
            try {
// Get the full URL using window.location.href because the information to right of the
// hash symbol holds token information that later will
                 redirectMatch = new RegExp(redirectUrl + "(?:#!)*#access_token", "i");
// sometimes when dropbox redirect happens, #!#access_token instead of just #access_token
                 if (win.location.href.match(redirectMatch)) {
// yep, the popup window has now redirected to redirect_uri
// The below command stops the constant tracking on the window's URL name.
                     clearInterval(pollTimer);
		             var popUrl = win.location.href;
// extract the token information from the popup window's URL:
                     var tokenVal   = gup(popUrl,'access_token');  // Get the token value from the hash fragment
                     var tokenState = gup(popUrl,'state');
// compare the "state" returned in the hash fragment to the state that was generated by this app and stored
                     if (statestr == tokenState) {
// Save the token info where the code running in sharelatex window can get to it
                         GM_setValue(storedTokenName, tokenVal);
		                 var now = new Date();
		                 GM_setValue(storedTimeName, now.getTime());
// by Javascript defintion, is number milliseconds since year 1970
			             win.close(); // close the popup window to which the login window was redirected
                         loginAndGetAndWriteBib();
// go back to the stop of this function, see if any other token needs resetting
                     } else {
// If the state extracted from the URL does not match the value used in the original call for login window,
// then be suspicious of malicious behavior and reject the token information
	                     alert("The state value returned in the hash fragment does not match the generated value");
			             win.close(); // close the popup window to which the login window was redirected
                     }
// Note:  seems that any redirect_uri works for carrying the token info in the hash fragment, but the only redirect_uri
// that seems to work for closing the window after token information has been extracted is a redirect_uri that includes
// www.sharelatex.com.   i think the reason has something to do with "same origin policy", where "origin" in this case means
// matching the URL base of the site that the button is installed on. More testing is needed in order to verify this statement.
                }
            } catch(e) {};
        }, 500);  // check every 500 milliseconds to see if the condition presented above with tst1 and tst2 are met

    } else {getAndWriteBib(0); } // If we end up here, means that both the Mendeley and Dropbox tokens are up-to-date
// If we started out with both Mendeley and Dropbox tokens expired, the first pass through will refresh
// the Mendeley token, then the 2nd pass through will take care of the Dropbox token.  The function will
// call itself again, a third time if 2 token renewals were necessary, ending up here, where the bibtex
// is finally called.
}
// ////////////////////////////////////// END (USERLOGIN) ////////////////////////////////////////


// ///////////////////////////////////////////  GUP //////////////////////////////////////////////
//  Accepts a URL (as a string) and strips out the access token information.
// ///////////////////////////////////////////////////////////////////////////////////////////////
function gup(url, param) {
// after many false tries from other sources, below are
// minor adaptions of http://www.webtoolkitonline.com/javascript-tester.html
// Split out the URL at the hash symbol and keep the part that comes after the hash
// Define the search by attaching an equal sign to the desired parameter a
      var searchStr = param + "=";
// Look for the requested parameter
      var pos = url.indexOf(searchStr);
      var parVal = "";
      if (pos != -1) {
// clip everything to the right of an including the equal sign. If pos=-1, then the param does not
// appear in URL so return null
          apiInfo = url.substring(pos + searchStr.length);
//  Now split out by the apersand and select characters to left of the first apersand
          parVal = apiInfo.split("&")[0];
      }
      return parVal;
}
// /////////////////////////////////////////// END (GUP) //////////////////////////////////////////////


// /////////////////////////////////////////// GETANDWRITEBIB ///////////////////////////////////////////////
// This function does most of the heavy lifting in acquiring the bibtex data:  it downloads the bibtex file
// (in chunks  ... there is a 500 item per download, so this program keeps downloading in increments until
// the entire file is obtained).  It then processes the bibtex file to clean up unwanted formats and content,
// and then sends it to a dropbox file.
// /////////////////////////////////////////////////////////////////////////////////////////////////
function getAndWriteBib(flag, bib, apiUrl, chunkTotal, chunkCnt) {
// Note that the last parameters, bib, apiUrl, chunkCnt, chunkTotal are only needed internally here and
// do not need to be called out by the other functions in this code when calling GETANDWRITEBIB.  If "bib"
// is left out of the function variables, bib gets set back to "" every time GM_xmlhttpRequest is called.
// To accumulate the bib, we need the bib to persist over multiple calls to GM_xmlhttpRequest while we are
// in GETBIB, which is why it is included as a parameter in the function call, for internal use. To get
// these other pieces of the bib, the Urls for each piece is a bit different.
    var mendTime = GM_getValue("StoredMendTime");
// Do a quick check on the validity of the Mendeley Token.  Should be OK, as we just checked prior to entering
// this part of the code, but if the user got distracted while logging in to either Mendeley or Dropbox, then
// token could be expired by now. So just check to be sure.
// If there is nothing in storage, set the token acquisition times to zero.  A "zero" effectively means that
// the acquisition happened on Jan 1, 1970! (Plenty long enough ago so that the tokens are definitely expired!)
    if (!mendTime) {mendTime = 0;}
// Check to see if the expiration times of the tokens are near expiration:
    var now = new Date();
    var mendElapsed = (now.getTime() - mendTime)/(1000.0*60.0);
// If the elapsed time on the tokens is within 5 minutes of the time duration of the tokens, then call it close
// enough to need a fresh login to get a new token for either/both Mendeley and Dropbox
    if (mendElapsed > ( mendExpTime - 5.0) ) {  // token is expired or close to expiration -- go back to user login
        loginAndGetAndWriteBib();
    } else { // token is fine, proceed with downloading the file
        if (flag == 0) {
            var bib = ""; // initialize the bib parameter that will hold the content of the bibtex file
            var apiUrl = mendAPI; // globally defined at top of code
	        var chunkCnt = 0;
	        var chunkTotal = 0;
        }
        var mendToken = GM_getValue("StoredMendToken");
        GM_xmlhttpRequest({
            method: "GET",
            url: apiUrl,
            headers: {'Authorization': 'Bearer ' + mendToken,
                      'Accept': 'application/x-bibtex'},
            onload: function(data) {
// Check for any errors.  A status of 200 would indicate a response without error or warning
                      if (data.status == 200) {    // Success!!
// Determine the number of "chunks" required to fully download the content.  As each chunk is downloaded,
// update the displayed status bar. The total number of bib entries is given in the data.responseHeaders beside
// the "Mendeley-Count:" field.  Look for those words, retrieve value:
			               if (flag == 0) { // first chunk of data
		  	                    var numMatch = /Mendeley-Count:\s*(\d+)/;
			                    var numEntries = numMatch.exec(data.responseHeaders)[1];
// figure out how many total chunks of data to be downloaded:
 			                    chunkTotal = Math.ceil(numEntries / chunkSize); // rounds up to nearest integer
// Note: when I had a "var" in front of chunkTotal, the number would not pass
// through to the next iteration downloading the next chunk .. I got an "undefined"
// error for chunkTotal.  When I removed the "var", the value carried through multiple
// iterations necessary to download the entire file.  Very weird behavior
// Get the status bar set up....
// First, set up the background bar. This bar will stretch all the way across from 0 to 100%
// As the data is downloaded, a bar that is on top of this background bar will slowly cover up
// this background bar.  This background bar is sort of the "footprint" of the moving bar, to
// indicate where 0 and 100% are.  Also, there will be the words "BibTex uploading from Mendeley"
// on this background bar, to indicate what is happening.  Those words will get covered up as
// the top bar moves across as the percentage of received data increases.  There will be some
// transparency in that top bar, though, so those words in this background bar will show through.
                                var barFixed = makeBar("BibTex downloading from Mendeley","progressBar1",
						        barLength+"px", "lightgrey", "1.0");
// The passed parameters are the words to appear in the bar, the ID of the bar, the length of the bar, color, and opacity
// Now add the moving bar that will move along on top of this fixed background bar, as file is retrieved
		                        var barMove = makeBar("", "progressBar2", "2px", "green", "0.5");
// note that the "2px" length is provided just to allow a faint hint of a green status bar to show
                           }
// figure out the current percentage of downloaded data, update the status bar
			               chunkCnt = chunkCnt + 1;
// will probably have to call the below up by their identities in order to change them
			               document.getElementById("progressBar2").style.width = Math.round( (chunkCnt / chunkTotal )*barLength )+'px';
  	                       if ( chunkCnt == chunkTotal ) { //if all the data is loaded
// Make the green bar completely cover up the background bar and state that the download is complete
			                   document.getElementById("progressBar2").style.opacity = '1.0';
			                   document.getElementById("progressBar2").textContent = 'BibTex download has finished!';
// add the retrieved chunk of bibtex file to the previously-downloaded piece. Note that if the "bib" in the param list
// in the function definition above is omitted, bib never accumulates but rather just takes on the value of the most
// current data.responseText value.
                           }
                           bib = bib + data.responseText;
// Determine if additional chunks remain to be downloaded. The max number of bib entries per download is
// 500.  If the number of bib entries exceeds this number, then have to retrieve the full bibtex file
//   in 500-entry chunks at a time. The headers store a url to the next chunk, if there are still "pages" of
//   bib entries remaining to be downloaded.  See  http://dev.mendeley.com/reference/topics/pagination.html  and
//   https://mendeleyapi.wordpress.com/2014/08/13/paginated-collections-an-example/ for more info.  By way of
//   example, in the headers, there is the following fields:
//   <https://api.mendeley.com/documents?view=bib&group_id=5a...&marker=d73c...&limit=20&reverse=false&order=acs>;rel="next",
//  <https://api.mendeley.com/documents?view=bib&group+id=5a...&limit=20&reverse=true&order=asc>;rel="last"
//  Mendeley-Count: 850   <-- the "Mendeley-Count" field provides the total number of entries
//   The "Link" lines do not exist if the last "page" of bibtex entries have been downloaded. The presence of this
//   entry in the header triggers another (recursive) download. If not in header, code assumes the whole bibtex has
//   been retrieved and procedes with the processing and saving to file.
                           if (data.responseHeaders.indexOf('; rel="next"') != -1) {
// Extract the url to get the next chunk
                                var pos1 = data.responseHeaders.indexOf("Link: <https://api.mendeley.com");
                                var pos2 = data.responseHeaders.indexOf('>; rel="next"');
                                var urlNext = data.responseHeaders.slice(pos1+7,pos2);
                                getAndWriteBib(1, bib, urlNext, chunkTotal, chunkCnt);
                           } else {
// Remove the status bar
			                    var b1 = document.getElementById("progressBar1");
                                if (b1) {b1.parentNode.removeChild(b1); }//the progress bar exists, remove it
			                    var b2 = document.getElementById("progressBar2");
                                if (b2) {b2.parentNode.removeChild(b2); }//the progress bar exists, remove it
// Place a marker at the top, "%top", a needed label to tell writeBib where it is within the file.
                                bib = "%top\n"+bib;
// To bypass all the bib processing and just go from Mendeley to Dropbox, comment out the next 4 lines that are
// between here and the call to writeBib. The processing that happens in processBib is very specialized and geared
// towards astronomical research).
// Start the step to process the fully-downloaded bib. First step is to initiate a new status bar:
                                var barAlert = makeBar("BibTex being processed...", "processBar", "300px", "yellow", "1.0");
    		                    bib = processBib(bib);
                                var pb = document.getElementById("processBar");
                                if (pb) {pb.parentNode.removeChild(pb);} // remove the bar showing processing status
// fix up the cite keys in bib, check bib for errors, replace weird characters with latex equivalent, etc.
                                writeBib(bib, dbApiBase);
                           }
                      } else {  // Crap ... status not 200 -> a problem with token or syntax or Mendeley server
// Remove the status bar
		                   var b1 = document.getElementById("progressBar1");
                           if (b1) {b1.parentNode.removeChild(b1); }//the progress bar exists, remove it
			               var b2 = document.getElementById("progressBar2");
                           if (b2) {b2.parentNode.removeChild(b2); }//the progress bar exists, remove it
                           statusMsg(data.status);
		              }
            },
           onerror: function() {  // Crap ... a connection problem
// Remove the status bar
		         var b1 = document.getElementById("progressBar1");
                 if (b1) {b1.parentNode.removeChild(b1); }//the progress bar exists, remove it
		         var b2 = document.getElementById("progressBar2");
                 if (b2) {b2.parentNode.removeChild(b2); }//the progress bar exists, remove it
                 alert("Something went wrong with the connection to Mendeley");
           }
        });
    }
}
// ////////////////////////////// END (GETANDWRITEBIB) ///////////////////////////////////////////


// ///////////////////////////////////////// MAKEBAR //////////////////////////////////////////////
// Generates a colored bar of desired size, color, and text content.
// ////////////////////////////////////////////////////////////////////////////////////////////////
function makeBar(barText, barId, barLong, barColor, barOpacity) {
    var bar = document.createElement('div');
    bar.setAttribute("style", "font-size: 12px; position: absolute; top:7px; left:125px; "
		     + "height:25px; line-height:25px; vertical-align:middle; text-align:center");
    bar.setAttribute('class', 'note');  // don't know what these are!
    bar.style.width = barLong; // the horizontal length of the bar
    bar.style.backgroundColor = barColor; // color of this background bar
    bar.style.opacity = barOpacity;
    bar.textContent = barText; // words that will appear(and get covered)
    bar.id = barId;
    document.body.appendChild(bar);
    return bar;
}
// Some inspiration for progress bar taken from userscripts-mirror.org/scripts/review/175448 //
// https://stackoverflow.com/questions/18310038/xmlhttprequest-upload-onprogress-instantly-complete
// ///////////////////////////////////// END (MAKEBAR) //////////////////////////////////////////


// ///////////////////////////////////////// WRITEBIB //////////////////////////////////////////
// This function takes the cleaned-up, ready-for-press bibtex and saves it to a dropbox file  //
// /////////////////////////////////////////////////////////////////////////////////////////////
function writeBib(remainingBib, nChunks, chunkCnt, sessionID, byteAccum)
// In this function, remainingBib keeps getting written in chunks, and remainingBib gets whittled down as it
// gets written to file, until there is nothing left in remainingBib, signaling the end of calling the
// Dropbox API.
{
// https://blogs.dropbox.com/developers/2016/03/how-formio-uses-dropbox-as was super helpful in determining
// what the call needed to be to create a text file. Recursive calls are made in this function (e.g.,
// writeBib calls itself repeatedly) until all the chunks have been written to file, and until both the "good"
// and the "bad" bibtex files have been created as 2 separate files. The "bad" bib is just the collection
// of entries in the bib reference library that had incomplete entry information and need attention before
// they can be included as viable bib references.
    var dbTime = GM_getValue("StoredDbTime");
// Do a quick check on the validity of the Dropbox Token.  Should be OK, as we just checked prior to entering
// this part of the code, but if the user got distracted while logging in to either Mendeley or Dropbox, then
// token could be expired by now. So just check to be sure.
// If there is nothing in storage, set the token acquisition times to zero.  A "zero" effectively means that
// the acquisition happened on Jan 1, 1970! (Plenty long enough ago so that the tokens are definitely expired!)
    if (!dbTime) {dbTime = 0;}
// Check to see if the expiration times of the tokens are near expiration:
    var now = new Date();
    var dbElapsed = (now.getTime() - dbTime)/(1000.0*60.0);
// If the elapsed time on the tokens is within 5 minutes of the time duration of the tokens, then call it close
// enough to need a fresh login to get a new token for either/both Mendeley and Dropbox
    if (dbElapsed > dbExpTime - 5.0) {  // token is expired or close to expiration -- go back to user login
        loginAndGetAndWriteBib();
    } else { // token is fine, proceed with writing the file
        var dbToken = GM_getValue("StoredDbToken");
// take the bib and separate the good from the bad from the informational section
        var clipHere = remainingBib.indexOf("CLIP-HERE");
        if (clipHere != -1) {
            var goodBib = remainingBib.slice(0,clipHere); // get the first part of string up to but not including the CLIP-HERE
        } else { var goodBib = ''; }
        var clipInfo = remainingBib.indexOf("CLIP-INFO");
        if (clipInfo != -1) {
            var badBib  = remainingBib.slice(clipHere + 9, clipInfo);
        } else { var badBib = ''; }
// above says: get everything past the last "e" in CLIP-HERE and just before the "c" in CLIP-INFO
        var infoBib = remainingBib.slice(clipInfo + 9);
// in the event that goodBib or badBib were to end with a "SNIPSNIP", the code below breaks because it
// anticipates that the file continues beyond a SNIPSNIP (a chunk divider). Remove any SNIPSNIPs that end
// up being the last item in a goodBib or badBib, the result of the file being an integer number of chunks,
// by first inspecting the very last 8 characters of the files:
        var endTest = goodBib.substr(goodBib.length-8,8);
        if (endTest.trim() == "SNIPSNIP") {goodBib = goodBib.substring(0,goodBib.length-8); }
        endTest = badBib.substr(badBib.length-8,8);
        if (endTest.trim() == "SNIPSNIP") {badBib = badBib.substring(0,badBib.length-8); }
// clip out the next chunk, indicated by either the text up to the words "SNIPSNIP", or to the end of the file,
// whichever is the situation:
        if (goodBib) { // if there still are some remaining chunks in the good bib section, grab the topmost chunk:
            var bibName = bibFile;
// search for the preamble, which would indicate a prestine, as-of-yet unaltered bibtex file
            var atTop = goodBib.indexOf("%top");
            if (atTop != -1) {
// Need to make a special consideration if the processBib was commented out and the file is one big block
// without SNIPSNIP and CLIP-HERE
                if (!badBib && !infoBib) {
                    var nChunks = 1;
                } else {
                    var nChunks = ((goodBib.match(/SNIPSNIP/g) || []).length + 1) + ((badBib.match(/SNIPSNIP/g) || []).length + 1) + 1;
                }
// The additional +1 above is to account for the very last chunk that is the informational section
                var chunkCnt = 1;
                var barFixed = makeBar("saving bibtex to /dropbox/Apps/ShareLaTeX/"+docTitle,"uploadBar1",
				                       barLength+"px", "lightgrey", "1.0");
// The passed parameters are the words to appear in the bar, the ID of the bar, the length of the bar, color, and opacity
// Now add the moving bar that will move along on top of this fixed background bar, as file is retrieved
		        var barMove = makeBar("", "uploadBar2", "2px", "green", "0.5");
// note that the "2px" length is provided just to allow a faint hint of a green status bar to show
            } else {chunkCnt = chunkCnt + 1;}
// we have an intact bibtex -- count the number of goodbib chunks (if no match, returns a "1" for the single chunk)
            var snipHere = goodBib.indexOf("SNIPSNIP");
            if (snipHere != -1) { // this chunk is one of multiple chunks
                var partBib = goodBib.slice(0,snipHere); // one of multiple chunks
// remove this chunk from remainingBib
                remainingBib = goodBib.slice(snipHere + 8) + "CLIP-HERE" + badBib + "CLIP-INFO" + infoBib;
            } else { // this chunk is either the only chunk or the last chunk
                var partBib = goodBib;
                remainingBib = "CLIP-HERE" + badBib + "CLIP-INFO" + infoBib;
            }
        } else if (badBib) { // after all the goodBib has been whittled out, if there are some remaining chunks in badbib section, get the top chunk
            bibName = problemBib;
            atTop = badBib.indexOf("%top");
            chunkCnt = chunkCnt + 1;
            snipHere = badBib.indexOf("SNIPSNIP");
            if (snipHere != -1) {
                partBib = badBib.slice(0,snipHere);
                remainingBib = "CLIP-HERE" + badBib.slice(snipHere + 8) + "CLIP-INFO" + infoBib;
            } else {
                partBib = badBib;
                remainingBib = "CLIP-INFO" + infoBib;
            }
        } else { // all that's left is the informational section
            var bibName = informationBib;
            partBib = infoBib;
            atTop = 0;
            snipHere = -1;
            remainingBib = '';
            chunkCnt = chunkCnt + 1;
        }

// Now define the header information that gets passed to the API:
        if (atTop != -1 && snipHere == -1) {
// Note: the above condition means there is only 1 chunk for this bib file. The
// fact that atTop is a non-negative number means that we have a as-yet-unaltered bibfile so first-time through,
// and the absence of "SNIPSNIP" means that there are no other chunks presence.
            var appendAPI = 'upload';
            var hdr = {"Authorization": "Bearer " + dbToken,
                       "Dropbox-API-Arg": JSON.stringify({
                                                          path: dbFolder + bibName,
                                                          mode: "overwrite",
                                                          autorename: false,
                                                          mute: false}),
                       "Content-Type": "application/octet-stream"};
        } else if (atTop != -1) {
// If we here, the condition snipHere != -1 is implied, meaning that the word "SNIPSNIP" is present in the bibtex
// and so the data is in chunks.  The fact that atTop is non-negative means that this iteration
// is the first time through.  In other words, this chunk is the first, to be followed by other chunks.
            var appendAPI = 'upload_session/start';
            var hdr = {"Authorization": "Bearer " + dbToken,
                       "Dropbox-API-Arg": JSON.stringify({close: false}),
                       "Content-Type": "application/octet-stream"};
            var byteAccum = partBib.length;
        } else if (atTop == -1 && snipHere == -1) {
// the fact that atTop is -1 means that the remainingBib has already been chopped, so this
// iteration is not the first time through. Either this iteration is appending or finishing.
// The fact that "SNIPSNIP" was no longer present in the bibtex (snipHere == -1)  clarifies
// that the situation is that this chunk is the last one, so we are finishing the file.
            var appendAPI = 'upload_session/finish';
            var hdr = {"Authorization": "Bearer " + dbToken,
                       "Dropbox-API-Arg": JSON.stringify({
                                                          cursor: {session_id: sessionID,
                                                                   offset: byteAccum},
                                                          commit: {path: dbFolder + bibName,
                                                                   mode: "overwrite",
                                                                   autorename: false,
                                                                   mute: false}}),
                       "Content-Type": "application/octet-stream"};
            byteAccum = partBib.length + byteAccum;
        } else { // there are more chunks to follow and this is neither the first nor the last chunk
// the only remaining condition, that is captured here, would be that the url does not match the base API URL (so,
// not first time through --> multiple chunks) and sniphere != -1, or that there are remaining chunks.
               var appendAPI = 'upload_session/append_v2';
               var hdr = {"Authorization": "Bearer " + dbToken,
                          "Dropbox-API-Arg": JSON.stringify({
                                                             cursor: {session_id: sessionID,
                                                                      offset: byteAccum},
                                                             close: false}),
                          "Content-Type": "application/octet-stream"};
               byteAccum = partBib.length + byteAccum;
        }

        GM_xmlhttpRequest({
               method: "POST",
               url: dbApiBase + appendAPI,  // comes from the global definition at very top of code
               data: partBib,
               headers: hdr,
               onload: function(reply) {
// Check for any errors.  A status of 200 would indicate a response without error or warning
                     if (reply.status == 200) {    // Success!!
			              document.getElementById("uploadBar2").style.width = Math.round( (chunkCnt / nChunks )*barLength )+'px';
  	                      if ( chunkCnt == nChunks ) { //if all the data is loaded
  			                   var b1 = document.getElementById("uploadBar1");
                               if (b1) {b1.parentNode.removeChild(b1); }//the progress bar exists, remove it
  			                   var b2 = document.getElementById("uploadBar2");
                               if (b2) {b2.parentNode.removeChild(b2); }//the progress bar exists, remove it
// need to reload the ShareLaTex window - I discovered this necessity by accident.  ShareLaTeX apparently isn't aware
// of the updated bibtex file until it is refreshed (and preferably, with the cache cleared ... odd things happen if the
// cache is not cleared, such as old bibtex entries that are no longer in the current bibtex file present themselves as
// options when you start typing "\citep" in your ShareLaTeX document.
                               window.location.reload(true);  // the "true" forces page reload from server rather than from cache
                          }
// right here, assess what is left of wholebib, if we are at end of goodbib or of babdbib, what next call should be
// reset url to the base url if goodbib is done and badbib is about to begin
                          if (appendAPI == 'upload' && remainingBib != '') {writeBib(remainingBib);}
// above line: the good bib was in a single chunk, so continue on to the bad bib section
                          if (appendAPI == 'upload_session/start' ||
                              appendAPI == 'upload_session/append_v2') {
// above line: doesn't matter if we are processing the good or bad bib, if we just did an "append" or "start",
// need to continue processing until we reach a "final"
// Read in the number of bytes just transfered, add to the total. Extract the session ID
                                   var sessIdMatch = /"session_id":\s"(.+)"}/;
                                   if (sessIdMatch.test(reply.responseText)) { // only happens if the "start" is called
                                       sessionID = sessIdMatch.exec(reply.responseText)[1];}
                                   writeBib(remainingBib, nChunks, chunkCnt, sessionID, byteAccum);
                          }
// There is an unfortunate fact in the way that the Dropbox API works:  when appending, it wants to know
// the number of bytes that have been passed so far in the previous upload session that is building this file.
// The problem is that the API does not return any information regarding the size of the data just sent previously, but
// rather gives an error when a value that is different what what was expected is received.  To work
// around this problem, since I do not know how to determine the size in byte units of a chunk of string
// that contains both unicode (all those return characters, etc) and ascii, is to call the damn API twice:
// the first time is just a "fake" call with a value of 0 for this byte offset, then capture the error
// and the correct value for the number of uploaded bytes, then set the second call to the API with this correct
// value for the offset and do the upload for real. Not ideal.  This section of the code should be rewritten if
// a better way to determine the size of the chunks in byte units or if the API changes to provide such information
// without triggering an error happens.
                          if (appendAPI == 'upload_session/finish' && remainingBib !='') {
                              writeBib(remainingBib, nChunks, chunkCnt, sessionID, byteAccum);}
// above line: if finishing up with the last chunk on this bibfile, and if we aren't at end of whole file, start
// in with the bad bib section.
// Note that other possible conditions have not been captured, meaning that if those conditions exist, the functon
// exits without further activity.  Such conditions include if the remainingBib is empty, indicating
// that we have written the whole file.
                     } else {
// Landing here just means that the crude byte count we did was not quite right The true number of bytes uploaded
// so far is provided by the returned information from the Dropbox API, so extract that info and re-submit the
// chunk to be uploaded:
                            var offMatch = /"correct_offset":\s(\d+)}}/;
                            if (offMatch.test(reply.responseText)) {
                                 var newOff = offMatch.exec(reply.responseText)[1];
// restore remainingBib by attaching the current partBib back to it, then throw back to writeBib to re-do.
                                 if (appendAPI == 'upload_session/append_v2') {
                                     remainingBib = partBib + "SNIPSNIP" + remainingBib;
                                 } else remainingBib = partBib + remainingBib;
                                 chunkCnt = chunkCnt - 1;
                                 writeBib(remainingBib, nChunks, chunkCnt, sessionID, Number(newOff));
                            } else {
// Crap ... status not 200 -> a problem with token or syntax or Dropbox server
// Landing here probably means that there is something wrong with the offset in cursor in the headers, so look up
// the correct value and fix up the hdr.
// Remove the status bar
  			                     var b1 = document.getElementById("uploadBar1");
                                 if (b1) {b1.parentNode.removeChild(b1); }//the progress bar exists, remove it
  			                     var b2 = document.getElementById("uploadBar2");
                                 if (b2) {b2.parentNode.removeChild(b2); }//the progress bar exists, remove it
                                 alert('error ... I think something may have changed in the API syntax or you are using the wrong Session ID number');
                                 alert('sessionID  '+sessionID);
                                 alert(reply.responseText);
                                 alert(reply.responseHeaders);
                                 alert(reply.statusText);
                            }
   		             }
               },
               onerror: function(reply) {  // Crap ... a connection problem
                        alert("error!!!");
                        alert("incorrect offset?");
                        alert(reply.responseText);
                        alert(reply.responseHeaders);
                        var offsetMatch = /"session_id":\s"(.+)"}/;
                        var offset = offsetMatch.exec(reply.responseText)[1];
                        alert("the offset is "+offset);
                        byteAccum = offset;
                        var b1 = document.getElementById("uploadBar1");
                        if (b1) {b1.parentNode.removeChild(b1); }//the progress bar exists, remove it
                        var b2 = document.getElementById("uploadBar2");
                        if (b2) {b2.parentNode.removeChild(b2); }//the progress bar exists, remove it
                        statusMsg(reply.status);
             }
        });
    }
}
// /////////////////////////////////// END (WRITEBIB) /////////////////////////////////////////


// //////////////////////////////////////////////////////////////////////////////////////////////////////////////
// ////////////////////////////////////////////// PROCESSBIB ////////////////////////////////////////////////////
// //////////////////////////////////////////////////////////////////////////////////////////////////////////////
// This function takes the raw bibtex straight from Mendeley and cleans it up.  It removes extraneous
// information like abstracts, urls, etc. and forces all the citekeys to have the format of author_date_journal.
// It also insures that all of the journal names are changed to be their AASTEX equivalents, for example,
// "The Astronomical Journal" is turned into "/aj".
// Modifies the cite key to have the format of aaaaaaaayyyyvvv_ppp, where aaaaaaaa is the
// first author's last name (full length of the name), yyyy is the full year of the publication
// (or the current year if the year was originally designated as 5555 - indicates submitted, and
// 6666 - indicates in press), and vvv is the volume number to how ever many digits are required,
// and ppp is the page number of the starting page. With just a little effort, the cite key could
// be modified to whatever the user wants, just by tweaking the below, if the above format is
// not desired.
// /////////////////////////////////////////////////////////////////////////////////////////////////////////////
function processBib(bib){
// Before doing anything, remove the first line that simply says "%top".  It was put in there for the situation in
// which the user wanted to bypass processBib:
   bib = bib.replace(/%top\n/, "");
   var newBib = bib;
// The occurance of double curly brackets can mess up the search algorithms below that try to clean
// up the bib.  For example, Mendeley will sometimes produce "journal = {{The Astrophysical Journa}}" for no
// apparent reason.  Turn these sets of doubles into a set of singles, everywhere they occur:
   var findDouble = /\s=\s\{\{(?!\\)(.+)\}\},\n/;
// Note: in the very odd situation for which a latex symbol would be the very first "word" inside the
// bracket, we have a negative lookahead (?!\\) so that the leading bracket of such a latex symbole
// does not get blown away accidentally.
   while (findDouble.test(newBib)) { newBib = newBib.replace(findDouble, " = \{$1\},\n"); }
   findDouble = /\s=\s\{\{(?!\\)(.+)\}\}\n\}/;
   while (findDouble.test(newBib)) { newBib = newBib.replace(findDouble, " = \{$1\}\n\}"); }
   var noJournalAbbrev = '';  // entries that have viable info for an @article but an unrecognizable journal name are flagged here

// Now fix up the citekey field
//   var getEntry = /@.+\{.+,\n(?:\s{4}.+\},\n)+\s{4}.+\}\n\}\n?/gmu;
   var getEntry = /@.+\{.+,\n(?:\s{4}.+\},\n)+\s{4}.+\}\n\}/gmu;
// Explanation of the above RegEx ("getEntry"), which is able to grab an entire reference entry
// from the "@" all the way to the last "}" for that entry:
//     the @.+ grabs the beginning @ sign, followed by the field designating the type of entry (article, etc.)
//     the \{ grabs the first "{" (the backslash needed because { is a special character and backslash says take { literally
//     the .+, grabs the citekey that follows the first curly bracket, and includes the following comma
//     the \n grabs that first line break following the cite key and its comma
//     the stuff in the parenthesis followed by a + sign means that the stuff in the () occur at least once but could
//     be present repeatedly.  Let's look at the contents of the parenthesis:
//            ?:  just means to not both capturing the contents of the () as a group. We don't need to capture the contents,
//                but rather just to match the contents.  Later in code, we will need to capture the groups to get
//                values for journal name, author names, etc.
//            \s{4} grabs the 4 blank spaces that proceed every field in the entry
//            .+  grabs all the contents of the field, including the field name itself and the opening curly
//                bracket that encloses the value of field. Code knows to "stop" with the grabbing for this field
//                when it encounters the next item ...
//            \} is the terminating curly bracket for a field's value (backslash needed so that code looks for the
//               actual character } rather than trying to execute code associated with a curly bracket.
//            , grabs the comma that comes at the end of each field value
//            \n grabs the line return following each field value.  Important:  Note that the very last field
//               is not captured by the stuff in the parenthesis because the last field does not have an ending comma.
//            the )+ as described above defines the closing parenthesis of this group, and the + says this pattern
//            inside the () could occur multiple times.
//
//     out of the parenthesis, still need to capture that last remaining field and the last curly bracket that encloses
//     the entire reference entry.
//     the \s{4} grabs the preceding 4 white spaces in front of the last field of the reference entry
//     the .+ grabs the last field name, its value all the way up to but not including the right curly bracket
//     the \} is the right curly bracket enclosing the value of the last field
//     the \n is the line break for the last field
//     the \} is the last curly bracket for the reference entry
//     Note that the possible ending \n, the line break that separates one reference entry from the other, is not given as
//     part of the match, effectively truncating this line break from the end of every entry to insure consistency. Later,
//     a final line break will be added to the end of every entry, even the very last reference entry (which may or may
//     not have had a line break in the original bibtex. The /gmu says apply the pattern globally (across entire string),
//     the m says apply across the line breaks, (not sure this is needed if one explicitly acknowledges the line breaks
//     by \n as we have done in the above pattern), and the u says there may be unicode and just grab it with everything else.
  var entryList = newBib.match(getEntry);
  var goodBib = '%top\n'
                +'% File created on: '+new Date()+'\n';
  var badBib =  '%top\n'
                +'% File created on: '+new Date()+'\n'
                +'% The entries in this bib file were found to have missing information that makes\n'
                +'% them nonviable. Use this file to help correct the entries in Mendeley (be sure to sync\n'
                +'% after you make any changes in the desktop Mendeley). The citekeys below help inform\n'
                +'% regarding what critical info is missing. Below is a guideline to help understand the format:\n'
                +'%      article:  Au? - missing name, Yr? - missing year, Jl? - missing journal name,\n'
                +'%                Vo? - missing volume number, Pg? - missing page number(s)\n'
                +'%         book:  Au? - missing name, Yr? - missing year, Tb? -- missing book title,\n'
                +'%                Pb? - missing publisher name\n'
                +'%  proceedings:  Au? - missing name, Yr? - missing year, Tp? -- missing article title,\n'
                +'%                Tb? - missing book title\n'
                +'% Note that in addition to missing information, the entry type could be wrong, such as\n'
                +'% needing to be stated as article rather than book or thesis\n';
  var infoBib1 = ' This file provides additional information for the bibtex file(s) that were just downloaded.\n\n'
                +'  **********************************  M E N D B I B . B I B ***********************************\n'
                +' The file called "mendbib.bib" is the file of usable bibtex entries.  Those entries have been\n'
                +' checked for missing data, corrections have been made where possible, and every entry in there\n'
                +' should be usable. The "citekey" format follows a pattern consistent with its reference type:\n\n'
                +'   Ref. Type                                      Format\n'
                +' -------------  ------------------------------------------------------------------------------------\n'
                +'  @article      \[lastname\]\[year\]\[journal abbrev\]\[volume\]_\[page\]\n'
                +'  @book         \[lastname\]\[year\]\[1st sig. word of title\]\[1st sig. word of publisher\]\n'
                +'  @proceedings  \[lastname\]\[year\]\[1st sig. word of article title\]\[1st sig. word of book title\]\n';
   var infoBib2 = '\n\n  *******************************  M E N D B I B _ P R O B. B I B **********************************\n'
                +' The file called "mendbib_prob.bib" is a file of NONusable bibtex entries.  These entries have at\n'
                +' least 1 serious problem, rendering them nonviable. Usually the problem is missing information, like\n'
                +' a year, journal name, author name, etc.  The identified problem can easily be seen, as there are\n'
                +' question marks in the citekey field beside each component of the citekey that is missing info.\n'
                +' See mendbib_probs.bib for more details.';
// Useful info at https://tex.stackexchange.com/questions/31394/how-to-enter-publications
// -in-press-or-submitted-to-in-bibtex/ and http://jblevins.org/log/forthcoming

// ---------------------------------------------------------------------------------------------
// -------------------------- GO THROUGH EACH REFERENCE ENTRY, ONE AT A TIME -------------------
// ---------------------------------------------------------------------------------------------
  for(var cnt = 0; cnt < entryList.length; cnt++) {
// Now systematically go through each entry looking for needed parameters for the reference
// information, like first author last name, journal name, title of article, year of publication
// journal volume number, first page number. Where not defined, set parameter as "Au?", "Jl?",
// "Tp?", "Yr?", "Vo?", "Pg?", resp.
//
// Different information is needed for different types of reference entries.  For books, journal
// information is not needed, but rather editor name, book title, etc.  So look for those items as
// well, in the case of book entries
//
// Theses will require yet a different set of information.  Get the pieces of info needed for
// theses entries.
//
// In the event that an entry simply does not have all the required information to make
// a viable reference entry, flag it as being inadequate by placing it in the "badbib"
// section of the text that gets passed to writeBib.  In writeBib, the good and bad sections
// will be separated out and made into 2 separate files.  only the "good" file will be linked
// to the ShareLatex working directories.

// A good reference for what fields are required for different kinds of entries:
// web.mit.edu/rsi/www/pdfs/bibtex-format.pdf

// -----------------------------------  for Journal Articles @Article  ----------------------
//                   citekey format:     firstauthor2000apj500_42
//     required fields:  authors, year, journal, volume, page

// Note:  if you don't perform the .test first, but rather just go straight for the .exec line,
// and if the string does not match the syntax defined by the regex, the code immediately stops
// execution as if it reached the end of the for loop.  I think what happens is that an error
// happens in the case of a mis-match that stops execution.  So the .test is absolutely necessary
// to insure that the loop continues through all of the reference entries.
// Another Note:  if the "g" (for global) is included in these .exec and .test lines in the regex
// expression, the first time of execution will show a "true" if there is a match, but the second
// time through will raise a "false" even if there is a match.  The reason is that the "g" in an
// .test gets "incremented" keeping the code from finding a match in a following .exec.  In other words
// the code finds the match in the .test call, but then ignores that initial match and tries to find
// a match further along in the string in the subsequent .exec call.  Therefore, the "g" had to be
// removed since we absolutely need to do a .test and then a .exec.

// before doing anything more, run this bib entry through a processer to turn any special symbols like
// unicode or accented letters in author names into plain ascii equivalents (or ""), so that the citeKey
// does not end up with latex-unfriendly content (e.g., citekeys should not have curly brackets and
// other such latex mark-up in it).
     var asciiBib = fixSpecialChars(entryList[cnt], "ascii");
/// make an attempt to normalize the journal names, and consolidate to a syntax that is used by
// aastex, e.g., "\apj".  Then compare the before and after bib.  If different, then a journal match
// was made and the journal name was modified.  if not different, then no match was found, suggesting
// that the journal name could have been entered incorrectly in Mendeley and should be checked/corrected.
// If indeed the name is correct, then an entry matching that journal name should be made in MenDBib
// in order to process it into an abbreviation, so that this error won't happen again.
     var tmp = fixJournal(asciiBib, "ascii");
        asciiBib = tmp[0];
        var journalList = tmp[1];
// In addition to the special-character-turned-ascii version, we need a special-character-turned-latex
// version as well. Up until now, all the processing we've done (removing unnecessary sections, double
// curly brackets, etc) needed to be done no matter if the bib entry was an ascii versus latex version.
// Once the citekey is derived from the ascii version, the latex version will incorporate that citekey
// and will be the definitive version of the bibtex.
     var latexBib = fixSpecialChars(entryList[cnt], "latex");
     latexBib = fixJournal(latexBib, "latex")[0];
// from here on out, asciiBib is what is being analyzed, use its contents to come up with a viable citekey
     tmp = getFirstAuthor(asciiBib, latexBib);
     var firstAuthor = tmp[0];
        asciiBib = tmp[1]; // Note that getFirstAuthor may have found some formatting issues that required
        latexBib = tmp[2]; // corrections in the latex bib (also mirrored in the ascii version, to be consistent)
     var journal = getJournalName(asciiBib);
     var year = getYear(asciiBib);
     var volume = getVolumeNumber(asciiBib);
     var page = getPageNumber(asciiBib);
     var paperTitle = getPaperTitle(asciiBib);
     var bookTitle = getBookTitle(asciiBib);
     var publisher = getPublisherName(asciiBib);
     tmp = getPaperStatus(asciiBib, latexBib, journal); // problem in here
        var pubStatus = tmp[0];
        asciiBib = tmp[1]; // in the course of extracting the paper status, the journal field may have
        latexBib = tmp[2]; // changed (if the status was originally included in the journal field, the status
        journal =  tmp[3]; // will have been removed to give a "pure" journal name, also resulting in change in bib itself)
     tmp = getRefType(asciiBib, latexBib, journal, paperTitle, bookTitle, year, page, volume, firstAuthor);
        var refType = tmp[0];
        asciiBib = tmp[1];
        latexBib = tmp[2];
        journal  = tmp[3];
        page = tmp[4];
        paperTitle = tmp[5];
        bookTitle  = tmp[6];
// Now construct the citeKey: make the first letter in each ingredient to the citeKey be an
// uppercase letter, to help distinguish one field from the other when they are smooshed together.
     paperTitle = paperTitle.charAt(0).toUpperCase() + paperTitle.slice(1).toLowerCase();
     bookTitle = bookTitle.charAt(0).toUpperCase() + bookTitle.slice(1).toLowerCase();
     publisher = publisher.charAt(0).toUpperCase() + publisher.slice(1).toLowerCase();
     var citeArt = firstAuthor + year + journal + volume + "_" + page;
     if (pubStatus != "") {citeArt = firstAuthor + year + journal + pubStatus;}
     if (paperTitle.indexOf("?") == -1) {
         var aTitle = paperTitle;
// for thesis, books, tech reports the title may show up  under  either "title" field,
// so check both places and use whichever field that has a value for the
// below "citeBookThesisTechreop" citekey
     } else if (bookTitle.indexOf("?") == -1) {
         var aTitle = bookTitle;}
     var citeBookThesisTechrep = firstAuthor + year + aTitle + publisher;
     var citeInBookProceedings = firstAuthor + year + paperTitle + bookTitle;
// Now determine if any of the above are viable. If so, then use as the citeKey and
// change the "type" in the reference entry to match the type of viable citekey, if
// there is a mis-match.
     var citeKey = citeArt;
     if (citeArt.indexOf("?") == -1) {
         if (refType.toLowerCase() != "article") {refType = "Article";}
     } else if (citeInBookProceedings.indexOf("?") == -1) {
         citeKey = citeInBookProceedings;
	     if (refType.toLowerCase() != "incollection" &&
             refType.toLowerCase() != "inproceedings") {refType = "InProceedings";}
     } else if (citeBookThesisTechrep.indexOf("?") == -1) {
             citeKey = citeBookThesisTechrep;
             if (refType.toLowerCase() != "book" &&
	             refType.toLowerCase() != "phdthesis" &&
	               refType.toLowerCase() != "techreport") {refType = "Book";}
     }
// In spite of our best efforts to grab parameters to put together a viable citation, there
// will be entries that just don't have enough information to be a good reference. Those
// entries will have at least one "?" or maybe even more in their citeKey.
// Those "bad" references will currently all have citekeys that tried to follow that of an
// article (the default if nothing else seemed to work).  Let's now go back, if this entry is
// a "bad" one, and at least assign the citeKey format that is relevant to the "type" it
// is listed as, so that the user can see the citeKey and immediately know what fields need
// attention so that this reference can be included as a viable entry in the bibtex.
    if (citeKey.indexOf("?") != -1) {
	    if (refType.toLowerCase() == "book" ||
	        refType.toLowerCase() == "phdthesis" ||
	        refType.toLowerCase() == "techreport") {
	           citeKey = citeBookThesisTechrep;
	    } else if (refType.toLowerCase() == "incollection" ||
	               refType.toLowerCase() == "inproceedings") {
 	                    citeKey = citeInBookProceedings;}
    }
// At this point, refType's identity is finalized.  If the refType happens to be article, but
// the journal name was unrecognized by fixJournal, then there are 2 possibilities: (1) the journal name
// was entered with a typo (sometimes extra stuff gets attached to the end of the name by Mendeley that can
// cause the name to be unrecognized), or (2) the journal name is fine, but it is a less-common publication
// or even a non-refereed publication.  If the entry has all the information it needs to be a viable entry,
// and all that is missing is a proper abbreviation, then the entry will be put into the "good" file with
// a comment in it indicating that the entry could be in error and should be checked.  A pseudo abbreviation
// will be constructed by taking the first letter of each word in the journal name title, and the original
// title will be commented out.  Additionally, at the very top of the bib file, a comment will be made
// describing how a separate bib file needs to be constructed using a @string command to link the pseudo
// abbreviation to the real abbreviation. If the name in the journal field entry does not match one of
// the entries in journalList, then the journal is not among the more common journal names that are hardcoded
// in fixJournal.  Do that check right now:
   if (refType.toLowerCase() == "article" && citeKey.indexOf("?") == -1 && journalList.indexOf(journal) == -1) {
       var journalMatch = /\s{4}journal\s=\s\{(.+)\}(,?\n?)/i; // need to go back and get the full journal name
       if (journalMatch.test(asciiBib)) {
           var origAscii = journalMatch.exec(asciiBib)[1];
           var origLatex = journalMatch.exec(latexBib)[1];
// Get the first 2 letters of each word in the journal name, ignoring any characters that are not letters
           tmp = origAscii.replace(/[^a-zA-Z ]/g,"");  // replace any character that is NOT a letter, space or number with ""
           if (tmp.trim() != "") {
               tmp = tmp.split(" ");
               journal = '';
               for (var i=0; i < tmp.length; i++) { journal = journal + tmp[i].trim().substr(0,2).toLowerCase(); }
// Now comment out the original title line in the bib and insert the pseudo abbreviation:
               asciiBib = asciiBib.replace(journalMatch, "    journal = \{"+journal+"\}$2");
               latexBib = latexBib.replace(journalMatch, "    journal = \{\\"+journal+"\}$2");
// Now add a note in mendbib_info.README informing user how to deal with this undefined journal entry:
               noJournalAbbrev = noJournalAbbrev + "\\newcommand\\"+journal+"\{put-abbreviation-here\} %"+origLatex+"\n";
               citeKey = firstAuthor + year + journal + volume + "_" + page;
           }
       }
    }
// Knowing the final value for refType helps to determine what sets of information should be retained in
// the bib file and what is extraneous info that should be removed so as to keep a nice clean file.
    latexBib = removeUnwantedSections(latexBib, refType);
// replace the cite key of the latex version of the reference entry with this new one
    var curly = latexBib.indexOf("{");
    var comma = latexBib.indexOf(",");
    var part1 = latexBib.slice(0,curly+1); // get the first part of string up to and including the curly bracket
    var part2 = latexBib.slice(comma); // get everything including and beyond the comma on the first line.
// so now we have part1[old citekey]part2. We will be replacing the old citekey with the new one.
    latexBib = part1 + citeKey + part2;
// Since the reference type may have been changed in order to match what its citeKey format seemed to
// suggest (e.g., if it has everything needed for a journal paper but is accidentally marked as "book"),
// then make sure the correct reference Type is listed to insure that the entry is processed properly by latex:
// Uppercase the first letter of "type";
    refType = refType.charAt(0).toUpperCase() + refType.slice(1).toLowerCase();
    if (refType.toLowerCase() == "inproceedings") {refType = "InProceedings";}
    if (refType.toLowerCase() == "incollection") {refType = "InCollection";}
// Now replace the type with the best guess as to what we think the type really is:
    curly = latexBib.indexOf("{");
    part2 = latexBib.slice(curly).trim();  // everything from the curly bracket to end of entry
    latexBib = "@" + refType + part2;
// Store the firstAuthor into an array, and the year into another array, for purposes of
// ordering the final files in alphabetical (and for the same author, in ascending year) order.
    var tmpYear = year;
    tmpYear = tmpYear.replace("Yr?","0");
    if (cnt == 0) {
	    var authorOrder = [firstAuthor];
	    var yearOrder = [parseInt(tmpYear, 10)];  // convert the string value of year into integer value
	    var citeKeyArr = [citeKey];
    } else {
        authorOrder.push(firstAuthor); // tag the author of this reference entry onto the end of the building array
	    yearOrder.push(parseInt(tmpYear, 10));
	    citeKeyArr.push(citeKey);
    }
// Make sure that a dangling comma didn't get left on the end of the last field in this entry
    latexBib = latexBib.replace("\},\n\}", "\}\n\}");
// Now store the processed bib into the array:
    entryList[cnt] = latexBib+"\n";  // add that final line break to the end of the entry that had been truncated during extraction
 }  // ===========  end of first loop =====================

// The entries by now should all be fixed up as well as they can be, with the provided information.
// At this point, re-order them so that the firstauther last names are in ascending alphabetical
// order.  If multiple entries have same first author, organize by year (don't worry beyond that in terms
// of organization).
// Ugh, in javascript there is no command such as the IDL sort command that returns indices rather than
// just doing the sort.  So the below is a cludge to provide indices back after sorting on author name
// (taken from https://stackoverflow.com/questions/3730510/javascript-sort-array-and-return-an-array-of-
//  indicies-that-indicates-the-positi
//
// If there were some otherwise viable @article entries but with unidentified journals that did not receive proper
// abbreviations, then note that information here at the top of the goodbib file:

  if (noJournalAbbrev != "") {
       infoBib1 = infoBib1
                + "\n ******************** W A R N I N G ********* unrecognized journal name(s) ****************************\n"
                + " Some @article entries in mendbib.bib do not have journal names that are listed among the most commonly cited\n"
                + " journals hardwired into MenDBib (taken from aastex style file), so formal abbreviations could not be\n"
                + " assigned to those entries. One possible reason:\n"
                + "     Perhaps the journal name has a typo.  If such the case, correct the info in Mendeley,\n"
                + "     do NOT edit mendbib.bib, as the file will just get overwritten when you press the MenDBib button again!,\n"
                + "     be sure to sync any changes you make to the reference library using Mendeley desktop, and then\n"
                + "     hit the MenDBib button again to re-download bibtex.\n\n"
                + " If indeed the case is one of a less-commonly-cited journal, then do the following to incorporate its designated abbreviation:\n"
                + "     (1) Copy/paste the appropriate '\\newcommand' line(s) below near the top of your LaTeX document,\n"
                + "         preferably in the section where you have set up other personal \\newcommand definitions.\n"
                + "     (2) Look up the 'santioned' abbreviation for each entry using one of the below websites:\n"
                + "            http://adsabs.harvard.edu/abs_doc/non_refereed.html#\n"
                + "            http://adsabs.harvard.edu/abs_doc/refereed.html\n"
                + "     (3) Insert the abbreviation in the curly brackets within the associated \\newcommand line that you just\n"
                + "         copy/pasted, replacing the words 'put-abbreviation-here'.\n"
                + "         The text now inside the curly brackets will be the abbreviation used in the rendering of your LaTeX\n"
                + "         document's bibliography as if this journal's abbreviation had been listed in the aastex style file.\n"
                + "     See http://latex.org/forum/viewtopic.php?t=690 for extensive discussion related to this approach.\n"
                + " *********** C O P Y   L I N E S   B E L O W   I N T O   \\newcommand block in your LaTeX document *************\n"
                + noJournalAbbrev
                + " ********************************************************************************************************\n";
  } else {
      infoBib1 = infoBib1
                + "\n ***************************  All Journal Names Were Recognized ! *************************************\n";
  }
  var indices = sortIndices(authorOrder, 's', yearOrder, 'n');
  var badCnt = 1;
  var goodCnt = 1;
  var prevGoodEntry = "";
  for (var cnt = 0; cnt < authorOrder.length; cnt++) {
       var ind = indices[cnt];
       var tmpEntry = entryList[ind];
       var tmpCiteKey = citeKeyArr[ind];
// The entries should now be in alphabetical order, by the author last name, and by year for same author
// Now go through each entry one last time and determine if it goes in the "good" or "bad" bib file:
// Now determine if the entry is a viable reference entry or not (e.g, if there are any
// required fields that are not defined, then it is not a viable entry). Unviable entries go
// into "badBib", viable ones into "goodBib".
// Don't record this entry if it is redundant with the previous entry (remember that the organization
// is alphabetical, so duplicates will appear next to each other.
       if (tmpCiteKey != prevGoodEntry) { // if not redundant with previous entry ...
// The below is to determine if the current entry is one for the good or the bad (problem) file:
           if (tmpCiteKey.indexOf("?") != -1) { // a "bad" bib entry
               if (Math.floor(badCnt/chunkSize) == Math.ceil(badCnt/chunkSize)) {
                        tmpEntry = tmpEntry + "SNIPSNIP";}
// the above condition being met means that we're at the end of a chunk
               badCnt = badCnt + 1;
               badBib = badBib + tmpEntry;
           } else {
               if (Math.floor(goodCnt/chunkSize) == Math.ceil(goodCnt/chunkSize)) { // "good" bib entry
                        tmpEntry = tmpEntry + "SNIPSNIP";}
               goodCnt = goodCnt + 1;
               goodBib = goodBib + tmpEntry;
               prevGoodEntry = tmpCiteKey;
           }
       }
  } // ============= end of second loop =============

  infoBib1 = '%top\n'  // a file that just provides information on the overall bibtex status.
            +' File created on: '+new Date()+'\n'
            +' There are '+goodCnt+' entries in "mendbib.bib" and '+badCnt+' entries in "mendbib_prob.bib"\n\n'
            +infoBib1;
  newBib = goodBib + "CLIP-HERE" + badBib + "CLIP-INFO" + infoBib1 + infoBib2;
// The above provides a marker between the good and bad bibtex.  writeBib snips the file here and constructs 2
// separate files on Dropbox
  return newBib;
}
// /////////////////////////////////// END (PROCESSBIB) ///////////////////////////////////////

// /////////////////////////////////// GETFIRSTAUTHOR ///////////////////////////////////////
// 1st Author's last name is extracted for citeKey. Special characters are converted to their closest
// ascii equivalents or replaced with "XxX" to indicate a substitution of special character having no
// looked-up equivalent. If the last name is proceeded by "Jr", "Sr", "III", "PhD" and the like, the
// suffix is removed for the citeKey. If only 1 author appears and the name seems to be in the format of
// "first last" rather than "last, first", then the "words" following the first word will be assumed to
// be the last name for the citeKey.  A correction will be made in the bib file itself by switching
// the names and putting in a comma.  Sometimes the absence of commas in a author's name indicates
// a science center or mission team rather than an individual person.  The author line will be compared
// to some key words that could indicate such a situation, in which case the entire name of the team
// or science center will be used for the citeKey (after removing white space and converting the
// phrase to CamelFontFormat. If no author is given, --> "Au?" appears in the citeKey
function getFirstAuthor(aBib, lBib) {
   var authorMatch = /\s{4}author\s=\s\{(.+)\}/i;
   if (authorMatch.test(aBib)) { // if the author line exists in the bib
       fAuthor  = authorMatch.exec(aBib)[1]; // grab contents between the curly brackets
// Since the whole line of authors was grabbed, split out the first Author by taking characters up to first comma
       var commaPos = fAuthor.indexOf(",");  // is there a comma in the author line?
	   if (commaPos != -1) { // yes, there is a comma, so just peel off the word to the left of first comma as the name
	       fAuthor = fAuthor.slice(0, commaPos).trim();
	   } else { // nope, no comma.  Either the syntax is firstname lastname or the name is not that of a person
// If there were no commas in the author line, then check to see if the name was written as first last
// if such is the case, just take the second "word" as the last name and also fix in the latex file
	       var spacePos = fAuthor.indexOf(" ");  // are there spaces between words in the author line?
	       if (spacePos != -1) {  // yes, there is at least one space between words
// One more thing to check: if the "author" is really a science center.  if so, then don't
// just select the last word but rather use the entire phrase
	           var tmp = fAuthor.toLowerCase();  // convert the author line to lower case so that a test can be run
               var sciTest = tmp.indexOf("science"); // does "science" appear in the author list?
	           var centerTest = tmp.indexOf("center");  // or "center"?
	           var instTest = tmp.indexOf("inst"); // or "institution"?
	           var univTest = tmp.indexOf("university"); // or "university"?
	           var teamTest = tmp.indexOf("team"); // or "team"?
	           var missionTest = tmp.indexOf("mission"); // or "mission"?
               var supportTest = tmp.indexOf("support"); // or "support"?
// can add to this list if necessary!
		       if (sciTest == -1 && centerTest == -1 && instTest == -1 && univTest == -1
                   && teamTest == -1 && missionTest == -1 && supportTest == -1) {
// the "author" appears to be a person, and the name was written as firstname lastname.
                   var firstName = fAuthor.slice(0, spacePos).trim();
                   fAuthor = fAuthor.slice(spacePos+1).trim(); // assume this is last name
                   var authorGet = /author\s=\s\{.+\},/i;
// correct the actual latex version of the bib file for forcing lastname, firstname syntax:
                   if (authorGet.test(lBib)) {
                       lBib = lBib.replace(authorGet,"author = \{"+fAuthor+", "+firstName+"\},");
                       aBib = aBib.replace(authorGet,"author = \{"+fAuthor+", "+firstName+"\},");
                   }
                   authorGet = /author\s=\s\{.+\}\n\}/i;
                   if (authorGet.test(lBib)) {
                       lBib = lBib.replace(authorGet,"author = \{"+fAuthor+", "+firstName+"\}\n\}");
                       aBib = aBib.replace(authorGet,"author = \{"+fAuthor+", "+firstName+"\}\n\}");
                   }
	           } // The "author" appears to be an entity, not a person, don't try to rearrange the words
	        }
	   }
// Get rid of anything like "jr", "sr", dr, phd, "II", "III"
       fAuthor = fAuthor.replace(/\si+$/gi, ""); // get rid of "the first", the II, III, etc
// above says to match the occurance of at least one " i" or multiple "i's" following
// a space that are at the end of the string
	   fAuthor = fAuthor.replace(/\sjr$/gi, ""); // get rid of "Jr"
	   fAuthor = fAuthor.replace(/\ssr$/gi, ""); // get rid of "Sr"
	   fAuthor = fAuthor.replace(/\sdr$/gi, ""); // get rid of "Dr"
	   fAuthor = fAuthor.replace(/\sph\.?d\.?$/gi, ""); // get rid of "Ph.D."
// At this point, any remaining words should be legit last-name for the first author. However, there
// could be a space between the words (e.g., de la Cruz  or if an institution instead of a human author,
// "Chandra science center" for example).  Smoosh the words together. For clarity,
// capitalize the first letter of each of the words and make the rest be lower case.
	   fAuthor = fAuthor.charAt(0).toUpperCase() + fAuthor.slice(1).toLowerCase();
 	   var spacePos = fAuthor.indexOf(" ");
       while (spacePos != -1) {
	          var firstHalf = fAuthor.slice(0,spacePos).trim();
	          var secondHalf = fAuthor.slice(spacePos+1).trim();
	          secondHalf = secondHalf.charAt(0).toUpperCase() + secondHalf.slice(1).toLowerCase();
	          fAuthor = firstHalf + secondHalf;
	          spacePos = fAuthor.indexOf(" ");
	   }
// Make sure that any special characters are stripped out, otherwise may play havoc with
// latex if there are special characters inside the citeKey
       fAuthor = fAuthor.replace(/[^a-zA-Z]/g,"");  // replace any character that is NOT a letter with ""
       fAuthor = fAuthor.trim();
   } else { fAuthor = "Au?"; }
    return [fAuthor, aBib, lBib];
// Note:  took me a long time to figure this one out, but even though aBib and lBib could be modified
// above (in case where the first and last names need to be rearranged), these changes are not propogated back
// to the function that called them!  Apparently javascript makes a copy of the passed variables within a
// function and operates on that copy, but the copy is not passed back to the referencing code. We are returning
// an array of all the things that could have changed to get around this deficiency of javascript.
}
// /////////////////////////////////// END (GETFIRSTAUTHOR) ////////////////////////////////////

// ////////////////////////////////////// GETJOURNALNAME ///////////////////////////////////////
// obtain first-occuring non-trivial word in journal name for the citeKey;
// absence of journal returns a "Jl?"
function getJournalName(aBib) {
   var journalMatch = /\s{4}journal\s=\s\{(.+)\},?\n?/i;
   if (journalMatch.test(aBib)) {
       jrnl = journalMatch.exec(aBib)[1];
       jrnl = ignoreWords(jrnl);
       jrnl = jrnl.replace(/[^a-zA-Z0-9 ]/g,"");  // replace any character that is NOT a letter, space or number with ""
       jrnl = jrnl.trim();
   } else { jrnl = "Jl?"; }
   return jrnl;
}
// ///////////////////////////////// END (GETJOURNALNAME) /////////////////////////////////////

// ////////////////////////////////////// GETYEAR ///////////////////////////////////////
// if year is "0", "00", etc or not provided at all, the value is returned as "Yr?"
function getYear (aBib) {
   var yearMatch = /\s{4}year\s=\s\{(\d+)\},?\n?/i;
   if (yearMatch.test(aBib)) {
       yr = yearMatch.exec(aBib)[1];
       yr = yr.trim();
// replace repeated zeros occurring at beginning with a single zero
       while (yr.substr(0,1) == "0" && yr.length > 1) {yr = yr.substr(1);}
       yr = yr.trim();
	   if (yr == "0") {yr = "Yr?";}
   } else { yr  = "Yr?"; }
   return yr;
}
// ///////////////////////////////// END (GETYEAR) /////////////////////////////////////

// ///////////////////////////////// GETVOLUMENUMBER ////////////////////////////////////
// The volume number of the journal.  If not found or if equal to zero, returns a "Vo?"
function getVolumeNumber(aBib) {
   var volMatch = /\s{4}volume\s=\s\{(\d+)\},?\n?/i;
   if (volMatch.test(aBib)) {
       vol = volMatch.exec(aBib)[1];
       vol = vol.trim();
// replace any repeated zeros occurring at beginning with a single zero
       while (vol.substr(0,1) == "0" && vol.length > 1) {vol = vol.substr(1);}
       vol = vol.trim();
	   if (vol == "0") {vol = "Vo?";}
   } else { vol = "Vo?"; }
   return vol;
}
// ////////////////////////////// END (GETVOLUMENUMBER) /////////////////////////////////

// ///////////////////////////////// GETPAGENUMBER //////////////////////////////////////
// The page number of the journal (if range given, will extract first page).
// If page is absent or equal to zero(s), the returned value is "Pg?"
function getPageNumber(aBib) {
   var pageMatch = /\s{4}pages\s=\s\{(.+)\},?\n?/i;
   if (pageMatch.test(aBib)) {
       pg = pageMatch.exec(aBib)[1];
// only use the first page entry, if a range was provided:
       var dashPos = pg.indexOf("-");
       if (dashPos != -1) {pg = pg.substring(0, dashPos);}
// replace repeated zeros occurring at beginning with a single zero
       while (pg.substr(0,1) == "0" && pg.length > 1) {pg = pg.substr(1);}
       pg = pg.trim();
	   if (pg == "0") {pg = "Pg?";}
   } else { pg = "Pg?"; }
   return pg;
}
// ////////////////////////////// END (GETPAGENUMBER) /////////////////////////////////

// //////////////////////////////// GETPAPERTITLE ////////////////////////////////////
// The 1st significant word of the title of the journal publication or
// article/contributed paper/chapter of a book or conference proceedings.
// If no title, a value is returned of "Tp?"
function getPaperTitle(aBib) {
   var titleMatch = /\s{4}title\s=\s{(.+)\},?\n?/i;
   if (titleMatch.test(aBib)) {
       ptitle = titleMatch.exec(aBib)[1];
// Force title to just have 1 word, the first non-trivial word:
       ptitle = ignoreWords(ptitle);
// remove any special characters that we may have ended up with:
       ptitle = ptitle.replace(/[^a-zA-Z0-9 ]/g,"");  // replace any character that is NOT a letter, space or number with ""
       ptitle = ptitle.trim();
   } else { ptitle = "Tp?"; }
   return ptitle;
}
// //////////////////////////// END (GETPAPERTITLE) /////////////////////////////////

// /////////////////////////////// GETBOOKTITLE ////////////////////////////////////
function getBookTitle(aBib) {
// The 1st significant word of the title of the book or conf proceedings.
// No title --> "Tb?"
   var btitleMatch = /\s{4}booktitle\s=\s\{(.+)\},?\n?/i;
   if (btitleMatch.test(aBib)) {
       btitle = btitleMatch.exec(aBib)[1];
// Force title to just have 1 word, the first non-trivial word:
       btitle = ignoreWords(btitle);
// remove any special characters that we may have ended up with:
       btitle = btitle.replace(/[^a-zA-Z0-9]/g,"");  // replace any character that is NOT a letter or number with ""
       btitle = btitle.trim();
   } else { btitle = "Tb?"; }
   return btitle;
}
// //////////////////////////// END (GETBOOKTITLE) /////////////////////////////////

// ////////////////////////////// GETPUBLISHERNAME ////////////////////////////////////
// The 1st significant word of the name of the publisher of a book (if for a thesis,
// the publisher is typically the university). No publisher --> "Pb?"
function getPublisherName(aBib) {
   var pubMatch = /\s{4}publisher\s=\s{(.+)\},?\n?/i;
   if (pubMatch.test(aBib)) {
       pub = pubMatch.exec(aBib)[1];
// Force publisher to just have 1 word, the first non-trivial word:
       pub = ignoreWords(pub);
// remove any special characters that we may have ended up with:
       pub = pub.replace(/[^a-zA-Z0-9]/g,"");  // replace any character that is NOT a letter or number with ""
       pub = pub.trim();
   } else { pub = "Pb?"; }
   return pub;
}
// //////////////////////////// END (GETPUBLISHERNAME) ///////////////////////////////////

// ////////////////////////////// GETPAPERSTATUS ////////////////////////////////////
// Searches for the appearance of the words "in press" or "submitted" to determine if
// the reference has this special status.  These words can appear anywhere in the bib.
// The assumption here is that they will appear at the end of the journal name in the bib,
// so extra effort is made to extract the status words from the bib, re-read the journal
// and run it through fixJournal again in case it missed matching to a known journal before
// it was cleaned of the status verbiage.  The bibtex will handle entries with a "in press"
// or "submitted" status a bit differently, as in recognizing that the absence of a page
// or volume number is acceptable and not a deficiency of the entry.
function getPaperStatus(aBib, lBib, jrnl) {
  var pubStatus = "";  // is non-null only when a reference is a paper that is submitted, in press, etc.
  var statInPress = /\(\s*in\s*press\s*\)/i;
  var statSubmitted = /\(\s*submitted\s*\)/i;
  if (statInPress.test(aBib.toLowerCase())) {
//yes, paper seems to have an in-press status (typically a (in press) written by journal name
      pubStatus = "InPress";
      var statText = "In Press";
      var statMatch = statInPress;
  }
  if (statSubmitted.test(aBib.toLowerCase())) {
      pubStatus = "Submitted";
      var statText = "Submitted";
      var statMatch = statSubmitted;
  }

    // The parenthes arpound the status is not getting removed.  Need to go to regex

  if (statMatch) {
// Now that this status has been recorded, remove the occurance of the status from the bib so that the
// status can go in appropriate place (eg, if it was written by the journal name, the journal name will
// have been unrecognized by fixJournal, so the status needs to be removed and the bib run back through
// fixJournal again so that the appropriate abbreviation and latex markup can be inserted, and so that
// the correct journal notation can be inserted into the citeKey.
      aBib = aBib.replace(statMatch, "");
      aBib = fixJournal(aBib, "ascii")[0];
      aBib = aBib.trim();
      lBib = lBib.replace(statMatch, "");
      lBib = fixJournal(lBib, "latex")[0];
      lBib = lBib.trim();
// need to re-retrieve the journal information, now that the bib has changed.
      jrnl = getJournalName(aBib);
// Since the paper is not yet published, the volume number entry should be empty (e.g., Vo=?)
// Use that volume field to store the publication status, since volume typically comes after
// title separated by a comma when run through LaTeX processer, exactly where the "in press"
// should appear.
// first the ascii version of bib
      var volGet = /volume\s=\s\{.*\}/i;
      aBib = aBib.replace(volGet,"volume = \{"+statText+"\}");
      var pageGet = /pages\s=\s\{.*\}/i;
      aBib = aBib.replace(pageGet,"pages = \{\}");
// now the latex version of bib
      lBib = lBib.replace(volGet,"volume = \{"+statText+"\}");
      lBib = lBib.replace(pageGet,"pages = \{\}");
// insure that there is no page number, to be consistant with the "in press" or "submitted" status
// Although both volume and page may have changed in the bib, no need to change the "volume" and "page"
// variables that go into the citeKey, as these 2 fields will be completely ignored once the
// publication status is seen to be "in press" or "submitted".
  }
  return [pubStatus, aBib, lBib, jrnl];
}
// //////////////////////////// END (GETPAPERSTATUS) //////////////////////////////////

// /////////////////////////////// GETREFTYPE /////////////////////////////////////
// Get the "type" of this entry.  For example, "@article" or "@inproceedings". Additionally,
// if the journal name appears to have mistakenly been placed in the book or paper title field,
// move the contents to "journal", run fixJournal to get the correct abbreviation latex markup
// and re-extract the corrected bib to get the right journal name for the citeKey.
function getRefType(aBib, lBib, jrnl, ptitle, btitle, yr, pg, vol, fAuthor) {
   var typeMatch = /@(.+)\{/i;
   var refType = typeMatch.exec(aBib)[1];
   refType = refType.trim();
// try to automatically fix one other observation I've had:  that sometimes articles
// have all the info they need but have the wrong "type", and therefore the "journal"
// ends up under "title" or "booktitle".  Check to see if there is an entry under
// "title" or "booktitle" that matches with the name of a journal.  If there is indeed
// a match, then force the journal value to take on the value of the title, set the
// title to "?" and set the refType to "Article".
   if (jrnl == "Jl?" && ptitle != "Tp?" && yr != "Yr?"
       && pg != "Pg?" && vol != "Vo?" && fAuthor != "Au?") {
// See if there is a match with a common journal name.  We can easily figure this out
// by making a temporary bib entry that has the journal field set to whatever contents are
// curently listed as being the title, and sending the bib entry to fixJournal, then
// seeing if there are any changes between the temp bib entry and the original
// (indicating that the journal got changed into an abbreviation).
            var tmp = aBib.replace("title", "journal");
            var tmpCompare = fixJournal(tmp, "ascii")[0];
	        if (tmp != tmpCompare) {
// If indeed the journal name was in the wrong field, change the field name to be journal and make
// the reference type be "article" to match the information provided in the ref. Make these
// changes both in the latex and ascii versions of the bib (in the latex, to insure the final
// bibtex has these needed modifications to improve this reference entry, and in the ascii because
// the final journal name will be pulled out of it, and in case there are special characters coded
// in latex, best to use the ascii version of the journal name where such characters have been
// converted to non-latex ascii equivalents.
	            aBib = tmpCompare;
	            refType = "article";
// Need to change the bib to reflect this change in the refType
//                var firstCurly = aBib.indexOf("\{");
//                aBib = aBib. COME BACK
	            ptitle = "Tp?";
// Now extract the journal name again from this modified bib:
                jrnl = getJournalName(aBib);
// Since there is a possibility that the page number had an "L" appended to it by fixJournal,
// also need to re-retrieve the page information.
                pg = getPageNumber(aBib);
// Now correct the record in the latex version of the bib:
	            lBib = lBib.replace("title", "journal");
	            lBib = fixJournal(lBib, "latex")[0];
	        }
   }
// repeat the above, but for book title instead:
   if (jrnl == "Jl?" && btitle != "Tb?" && yr != "Yr?" &&
	   pg != "Pg?" && vol != "Vo?" && fAuthor != "Au?") {
               var tmp = aBib.replace("booktitle", "journal");
               var tmpCompare = fixJournal(tmp, "ascii")[0];
	           if (tmp != tmpCompare) {
	               aBib = tmpCompare;
	               refType = "article";
	               btitle = "Tb?";
                   jrnl = getJournalName(aBib);
                   pg = getPageNumber(aBib);
                   lBib = lBib.replace("booktitle", "journal");
 	               lBib = fixJournal(lBib, "latex")[0];
              }
   }
   return [refType, aBib, lBib, jrnl, pg, ptitle, btitle];
}
// //////////////////////////// END (GETREFTYPE) //////////////////////////////////

// /////////////////////////////// FIXJOURNAL /////////////////////////////////////////
// Different ways of indicating the same journal name is bound to happen in the Mendeley
// reference list.  The below attempts to consolidate, at least for the most well-known
// journal names. The consolidation results in forcing all journal names to have the
// notation expected in AASTEX. For example, "The Astronomical Journal" or "AJ" or
// "Astron. Journal" would all become "/aj".  Note that this function can change the
// value of the page number that is in the bib ... if the page number did not have a
// preceding "L" but the journal name implied the article was in ApJ Letters, A&A, or MNRAS
// for which the page should have an "L" but otherwise the journal reference remains that
// of a "normal" article (See https://mirror.hmc.edu/ctan/macros/latex/contrib/mnras/mnras_guide.pdf),
// then an "L" will be inserted in the appropriate place(s) within the pages field.
// Another good reference for abbreviations/latex commands was
// http://www.iac.es/proyecto/iau212/proceedings/IAUS212m.tex
// ////////////////////////////////////////////////////////////////////////////////////
function fixJournal(bib, version) {
// big help: https://stackoverflow.com/questions/1234712/javascript-replace-with-reference-to-matched-group
// http://aramis.obspm.fr/~coulais/BibTeX/aas_macros.sty, https://cdsads.u-strasbg.fr/abs_doc/aas_macros.html
    var str = bib;
    var journalList = [];
    if (version.toLowerCase() == "latex") {
        var pref = "journal = \{\\";
    } else { var pref = "journal = \{";}
    var suff = "\}";
// ----------------- ACTA ASTRONOMICA
    var name = "actaa";
    var abbrev = pref + name + suff;
    journalList.push(name);
    var getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bActa\s*A(?:s[tron]{0,4})?(?:om)?(?:ica)?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- ADVANCES IN SPACE RESEARCH
    name = "asr";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bA(?:d[van]{0,3})?(?:ces)?\.?\s*(?:in\s+)?\s*S(?:p[ace]{0,3})?\.?\s*R(?:e[search]{0,6})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- AMERICAN ASTRONOMICAL SOCIETY MEETING ABSTRACTS
    name = "aas";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bA(?:m[er]{0,2})?(?:ican)?\.?\s*A(?:s[tro]{0,3})?(?:n[om]{0,2})?(?:ical)?\.?\s*S(?:o[ciety]{0,5})?\.?\s*(?:M[eeting]{0,6})?\.?\s*(?:A[bstracts]{0,8})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- AMERICAN ASTRONOMICAL SOCIETY/ DIVISION FOR PLANETARY SCIENCES MEETING ABSTRACTS
    name = "dps";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bA?(?:m[er]{0,2})?(?:ican)?\.?\s*A?(?:s[tro]{0,3})?(?:n[om]{0,2})?(?:ical)?\.?\s*S?(?:o[ciety]{0,5})?\.?\s*\/?\:?\s*/
       ,/D(?:i[vis]{0,3})?(?:ion)?\.?\s*(?:for\s+)?P(?:la?)?(?:n[etary]{0,5})?\.?\s*S(?:c[iences]{0,6})?\.?\s*(?:M[eeting]{0,6})?\.?\s*(?:A[bstracts]{0,8})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- AMERICAN INSTITUTE OF PHYSICS CONFERENCE PROCEEDINGS
    name = "aipconf";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bA(?:m[er]{0,2})?(?:ican)?\.?\s*I(?:n[st]{0,2})?(?:itute)?\.?\s*(?:of\s+)?P(?:hy?)?(?:s[ics]{0,3})?\.?\s*C(?:o[nf]{0,2})?(?:erence)?\.?\s*(?:P[roc]{0,3})?(?:eedings)?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- ANNUAL REVIEW OF ASTRONOMY AND ASTROPHYSICS
    name = "araa";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bA(?:nn?)?(?:ual)?\.?\s*R(?:e[view]{0,4})?\.?\s*(?:of\s+)?A(?:s[tro]{0,3})?(?:n[omy]{0,3})?\.?\s*(?:and)?(?:\{\\&\})?(?:\\&)?(?:&)?\s*A(?:s[tro]{0,3})?(?:ph?)?(?:ys)?(?:ics)?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- APPLIED OPTICS
    name = "ao";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bA(?:p[pl]{0,2})?(?:ied)?\.?\s*O(?:p[tics]{0,4})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- ASTROFIZIKA (english translation: ASTROPHYSICS)
    name = "afz";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bAstrof[iz]{0,2}(?:i[ka]{0,2})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// Now look for the english translation: Astrophysics
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bAstrop[hy]{0,2}s?(?:ics)?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- ASTRONOMICHESKII ZHURNAL (english translation: ASTRONOMY LETTERS)
    name = "azh";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bA(?:s[tro]{0,3})?(?:n[om]{0,2})?(?:i[ch]{0,2})?(?:eskii)?\.?\s*z(?:h[urn]{0,3})?(?:al)?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// now take care of any occurances of the english translation, ASTRONOMY LETTERS
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/i
       ,/\bA(?:s[tro]{0,3})?(?:n[omy]{0,3})?\.?\s*L(?:e[tters]{0,5})?/i
       ,/\.?\s*\}/i].map(function(r) {return r.source;}).join(''));
    str = str.replace(getName, abbrev);
// ----------------- THE ASTRONOMICAL JOURNAL
    name = "aj";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bA(?:s[tro]{0,3})?(?:n[om]{0,2})?(?:ical)?\.?\s*J(?:o[urn]{0,3})?(?:al)?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- ASTRONOMICAL SOCIETY OF THE PACIFIC CONFERENCE SERIES
    name = "aspconf";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bA(?:s[tro]{0,3})?(?:n[om]{0,2})?(?:ical)?\.?\s*S(?:o[ciety]{0,5})?\.?\s*(?:of\s+)?(?:the\s+)?P(?:ac?)?(?:ific)?\.?\s*C(?:o[nf]{0,2})?(?:erence)?\.?\s*(?:S[eries]{0,5})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- ASTRONOMISCHE NACHRICHTEN
    name = "an";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bA(?:s[tro]{0,3})?(?:n[om]{0,2})?(?:ische)?\.?\s*N(?:a[ch]{0,2})?(?:r[ich]{0,3})?(?:ten)?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- ASTRONOMY REPORTS
// until 1992, this journal was known as Soviet Astronomy
    name = "arep";
   abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bAst(?:ro?)?n?(?:omy)?\.?\s*R(?:e[ports]{0,5})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- ASTRONOMY & ASTROPHYSICS
    name = "aap";
    abbrev = pref + name +suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bA(?:s[tro]{0,3})?(?:n[omy]{0,3})?\.?\s*(?:and)?(?:\{\\&\})?(?:\\&)?(?:&)?\s*A(?:st)?(?:ro)?(?:ph?)?(?:ys)?(?:ics)?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- ASTRONOMY & ASTROPHYSICS LETTERS
    name = "aap";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bA(?:s[tro]{0,3})?(?:n[omy]{0,3})?\.?\s*(?:and)?(?:\{\\&\})?(?:\\&)?(?:&)?\s*A(?:st)?(?:ro)?(?:ph?)?(?:ys)?(?:ics)?\.?\s*L(?:e[tters]{0,5})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    var testLetters = getName.test(str);
    str = str.replace(getName, abbrev);
// A mistake in the bibtex entry may have been made by entering the A&A Letters reference entry by designating "Letters" in the title.
// Letters should be designated by having an "L" in front of the page number instead
// See https://mirror.hmc.edu/ctan/macros/latex/contrib/mnras/mnras_guide.pdf
// So use the correct abbreviation \aap, and insure than an "L" appears in front of the page number.
// Now need to insure that the page number has an "L" in front of it. If a page range is given, be sure to correct
// both numbers.
    if (testLetters) {
        var getFirstPage = /pages\s=\s\{\s*(\d+)/;
        if (getFirstPage.test(str)) { str = str.replace(getFirstPage, "pages = \{L$1"); }
        var getSecondPage = /pages\s=\s\{\s*(\S+)\s*-+\s*(\d+)/;
        if (getSecondPage.test(str)) { str = str.replace(getSecondPage, "pages = \{$1--L$2"); }
    }
// ----------------- ASTRONOMY & ASTROPHYSICS REVIEWS
    name = "aapr";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bA(?:s[tro]{0,3})?(?:n[omy]{0,3})?\.?\s*(?:and)?(?:\{\\&\})?(?:\\&)?(?:&)?\s*A(?:st)?(?:ro)?(?:ph?)?(?:ys)?(?:ics)?\.?\s*R(?:e[views]{0,5})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- ASTRONOMY & ASTROPHYSICS SUPPLEMENTAL (Series)
    name = "aaps";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?(?!a\s*a\s*s\s*\})/
       ,/\bA(?:s[tro]{0,3})?(?:n[omy]{0,3})?\.?\s*(?:and)?(?:\{\\&\})?(?:\\&)?(?:&)?\s*A(?:st)?(?:ro)?(?:ph?)?(?:ys)?(?:ics)?\.?\s*S(?:u[pplemental]{0,10})?\.?\s*(?:S[eries]{0,5})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- ASTROPHYSICS SPACE PHYSICS RESEARCH
    name = "apspr";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bA(?:s[tro]{0,3})?(?:ph?)?(?:ys)?(?:ics)?\.?\s*(?:and)?(?:\{\\&\})?(?:\\&)?(?:&)?\s*S(?:p[ace]{0,3})?\.?\s*P(?:h[ysics]{0,5})?\.?\s*(?:R[esearch]{0,7})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- THE ASTROPHYSICAL JOURNAL
    name = "apj";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bA(?:s[tro]{0,3})?p(?:h[ys]{0,2})?(?:ical)?\.?\s*J(?:o[urn]{0,3})?(?:al)?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- THE ASTROPHYSICAL JOURNAL LETTERS
    name = "apjl";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bA(?:s[tro]{0,3})?(?:ph?)?(?:ys)?(?:ical)?\.?\s*J(?:o[urn]{0,3})?(?:al)?\.?\s*L(?:e[tters]{0,5})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    testLetters = getName.test(str);
    str = str.replace(getName, abbrev);
// the "al" needed to be broken out separately from "journ" to prevent "The AStrophysical Journal" from being a match. Essentially, we are
// forcing the "l" at the end of journal to be assocaited with "journal" rather than with the "L" in letters.
// Now need to insure that the page number has an "L" in front of it. If a page range is given, be sure to correct
// both numbers.
    if (testLetters) {
        getFirstPage = /pages\s=\s\{\s*(\d+)/;
        if (getFirstPage.test(str)) { str = str.replace(getFirstPage, "pages = \{L$1"); }
        getSecondPage = /pages\s=\s\{\s*(\S+)\s*-+\s*(\d+)/;
        if (getSecondPage.test(str)) { str = str.replace(getSecondPage, "pages = \{$1--L$2"); }
    }
// ----------------- THE ASTROPHYSICAL JOURNAL SUPPLEMENTAL (series)
   name = "apjs";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bA(?:s[tro]{0,3})?(?:ph?)?(?:ys)?(?:ical)?\.?\s*J(?:o[urn]{0,3})?(?:al)?\.?\s*S(?:u[pplemental]{0,10})?\.?\s*(?:S[eries]{0,5})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- ASTROPHYSICS LETTERS
    name = "aplett";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bA(?:s[tro]{0,3})?(?:ph?)?(?:ys)?(?:ics)?\.?\s*L(?:e[tters]{0,5})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- ASTROPHYSICS and SPACE SCIENCE
    name = "apss";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bA(?:s[tro]{0,3})?(?:ph?)?(?:ys)?(?:ics)?\.?\s*(?:and)?(?:\{\\&\})?(?:\\&)?\s*S(?:p[ace]{0,3})?\.?\s*S(?:c[ience]{0,5})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- ASTROPHYSICS and SPACE SCIENCE LIBRARY CONFERENCE SERIES
    name = "aaslconf";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bA(?:s[tro]{0,3})?(?:ph?)?(?:ys)?(?:ics)?\.?\s*(?:and)?(?:\{\\&\})?(?:\\&)?\s*S(?:p[ace]{0,3})?\.?\s*S(?:c[ience]{0,5})?\.?\s*L(?:i[brary]{0,5})?\.?\s*C(?:o[nference]{0,8})?\.?\s*(?:S[eries]{0,5})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- BULLETIN OF THE AAS
    name = "baas";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bB(?:u[lletin]{0,6})?\.?\s*(?:of\s+)?(?:the\s+)?A(?:m[erican]{0,6})?\.?\s*A(?:s[tro]{0,3})?(?:n[om]{0,2})?(?:ical)?\.?\s*S(?:o[ciety]{0,5})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- BULLETIN OF THE ASTRONOMICAL INSTITUTES OF THE NETHERLANDS
    name = "bain";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bB(?:u[lletin]{0,6})?\.?\s*(?:of\s+)?(?:the\s+)?A(?:s[tro]{0,3})?(?:n[om]{0,2})?(?:ical)?\.?\s*I(?:n[stitutes]{0,8})?\.?\s*(?:of\s+)?(?:the\s+)?N(?:e[therlands]{0,9})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- BULLETIN OF THE ASTRONOMICAL INSTITUTES OF CZECHOSLOVAKIA
    name = "bac";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bB(?:u[lletin]{0,6})?\.?\s*(?:of\s+)?(?:the\s+)?A(?:s[tro]{0,3})?(?:n[om]{0,2})?(?:ical)?\.?\s*(?:I[nstitutes]{0,9})?\.?\s*(?:of\s+)?C(?:z[echoslovakia]{0,12})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- CHINESE ASTRONOMY AND ASTROPHYSICS
    name = "caa";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bC(?:h[inese]{0,5})?\.?\s*A(?:s[tro]{0,3})?(?:n[omy]{0,3})?\.?\s*(?:and\s+)?(?:&)?(?:\\&)?(?:\{\\&\})?\s*A(?:s[tro]{0,3})?(?:ph?)?(?:ys)?(?:ics)?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- CHINESE JOURNAL OF ASTRONOMY AND ASTROPHYSICS
    name = "cjaa";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bC(?:h[inese]{0,5})?\.?\s*J(?:o[urn]{0,3})?(?:al)?\.?\s*(?:of\s+)?A(?:s[tro]{0,3})?(?:n[omy]{0,3})?\.?\s*(?:and\s+)?(?:&)?(?:\\&)?(?:\{\\&\})?\s*A(?:s[tro]{0,3})?(?:ph?)?(?:ys)?(?:ics)?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- COMPTES RENDUS ACADEMIA SCIENCE PARIS
    name = "crasp";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bC(?:o[mptes]{0,5})?\.?\s*R(?:e[ndus]{0,4})?\.?\s*A(?:c[ademia]{0,6})?\.?\s*S(?:c[ience]{0,5})?\.?\s*P(?:a[ris]{0,3})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- FUNDAMENTAL COSMIC PHYSICS
    name = "fcp";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bF(?:u[ndamental]{0,9})?\.?\s*C(?:o[smic]{0,4})?\.?\s*P(?:h[ysics]{0,5})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- GEOCHIMICA COSMOCHIMICA ACTA
    name = "gca";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bG(?:e[ochimica]{0,8})?\.?\s*C(?:o[smochimica]{0,10})?\.?\s*A(?:c[ta]{0,2})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- GEOPHYSICS RESEARCH LETTERS
    name = "grl";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bG(?:e[ophysics]{0,8})?\.?\s*R(?:e[search]{0,6})?\.?\s*L(?:e[tters]{0,5})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- ICARUS
    name = "icarus";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bIcar(?:us?)?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- INFORMATION BULLETIN OF VARIABLE STARS
    name = "ibvs";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bI(?:n[formation]{0,9})?\.?\s*B(?:u[lletin]{0,6})?\.?\s*(?:of\s+)?V(?:a[riable]{0,6})?\.?\s*S(?:t[ars]{0,3})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- INTERNATIONAL ASTRONOMICAL UNION CIRCULARS
    name = "iaucirc";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bI(?:n[ternational]{0,11})?\.?\s*A(?:s[tro]{0,3})?(?:n[om]{0,2})?(?:ical)?\.?\s*U(?:n[ion]{0,3})?\.?\s*C(?:i[rculars]{0,7})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- IRISH ASTRONOMICAL JOURNAL
    name = "iaj";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bI(?:r[ish]{0,3})?\.?\s*A(?:s[tro]{0,3})?(?:n[om]{0,2})?(?:ical)?\.?\s*J(?:o[urn]{0,3})?(?:al)?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- JOURNAL OF ASTROPHYSICS AND ASTRONOMY (Indian publication)
    name = "japa";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bJ(?:o[urn]{0,3})?(?:al)?\.?\s*(?:of\s+)?A(?:s[tro]{0,3})?(?:ph?)?(?:ys)?(?:ics)?\.?\s*(?:and)?(?:&)?(?:\\&)?(?:\{\\&\})?\s*A(?:s[tro]{0,3})?(?:n[omy]{0,3})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- JOURNAL OF COSMOLOGY AND ASTROPARTICLE PHYSICS
    name = "jcap";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bJ(?:o[urn]{0,3})?(?:al)?\.?\s*(?:of\s+)?C(?:o[smology]{0,7})?\.?\s*(?:a[nd]{0,2})?(?:&)?(?:\\&)?(?:\{\\&\})?\s*A(?:s[tro]{0,3})?(?:part)?(?:icle)?\.?\s*P(?:h[ysics]{0,5})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- JOURNAL OF CHEMICAL PHYSICS
    name = "jcp";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bJ(?:o[urn]{0,3})?(?:al)?\.?\s*(?:of\s+)?C(?:h[emical]{0,6})?\.?\s*P(?:h[ysics]{0,5})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- JOURNAL OF GEOPHYSICS RESEARCH  STOPPED HERE
    name = "jgr";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bJ(?:o[urn]{0,3})?(?:al)?\.?\s*(?:of\s+)?G(?:e[ophysics]{0,8})?\.?\s*R(?:e[search]{0,6})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- JOURNAL OF QUANTITATIVE SPECTROSCOPY AND RADIATIVE TRANSFER
    name = "jqsrt";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bJ(?:o[urn]{0,3})?(?:al)?\.?\s*(?:of\s+)?Q(?:u[ant]{0,3})?(?:itative)?\.?\s*S(?:p[ect]{0,3})?(?:ro?)?(?:scopy)?\.?\s*(?:and\s+)?R(?:a[diative]{0,7})?\.?\s*T(?:r[ansfer]{0,6})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- JOURNAL OF THE RAS OF CANADA
    name = "jrasc";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bJ(?:o[urn]{0,3})?(?:al)?\.?\s*(?:of\s+)?(?:the\s+)?R[oyal]{0,4}\.?\s*A(?:s[tro]{0,3})?(?:n[om]{0,2})?(?:ical)?\.?\s*S(?:o[ciety]{0,5})?\.?\s*(?:of\s+)?C[anada]{0,5}/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- LECTURE NOTES IN PHYSICS
    name = "lnp";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bL(?:e[cture]{0,5})?\.?\s*N(?:o[tes]{0,3})?\.?\s*(?:in?)?\.?\s*P(?:h[ys]{0,3})?(?:ics)?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- MEMOIRS OF THE RAS
    name= "memras";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bMem[oirs]{0,4}\.?\s*(?:of\s+)?(?:the\s+)?R(?:o[yal]{0,3})?\.?\s*A(?:s[tro]{0,3})?(?:n[om]{0,2})?(?:ical)?\.?\s*S[ociety]{0,6}/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- MEMOIRE DELLA SOCIETA ASTRONOMICA ITALIANA
    name = "memsai";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bMem[oire]{0,4}\.?\s*(?:d[ella]{0,4})?\.?\s*S(?:o[cieta]{0,5})?\.?\s*A(?:s[tronomica]{0,9})?\.?\s*I(?:t[aliana]{0,6})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- METEORITICS & PLANETARY SCIENCE
    name = "maps";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bM(?:e[teor]{0,4})?(?:itics)?\.?\s*(?:a[nd]{0,2})?(?:&)?(?:\\&)?(?:\{\\&\})?\s*P(?:l[anetary]{0,7})?\.?\s*S(?:c[ience]{0,6})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- MONTHLY NOTES of the ASTRONOMICAL SOCIETY OF SOUTHERN AFRICA
    name = "mnassa";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bM(?:o[nthly]{0,5})?\.?\s*N(?:o[tes]{0,3})?\.?\s*(?:of\s+)?(?:the\s+)?A(?:s[tro]{0,3})?(?:n[om]{0,2})?(?:ical)?\.?\s*S(?:o[ciety]{0,5})?\.?\s*(?:of\s+)?S(?:o[uthern]{0,6})?\.?\s*A(?:f[rica]{0,4})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- MONTHLY NOTICES of the ROYAL ASTRONOMICAL SOCIETY
    name = "mnras";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bM(?:o[nthly]{0,5})?\.?\s*N(?:o[tices]{0,5})?\.?\s*(?:of\s+)?(?:the\s+)?R(?:o[yal]{0,3})?\.?\s*A(?:s[tro]{0,3})?(?:n[om]{0,2})?(?:ical)?\.?\s*S(?:o[ciety]{0,5})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- MONTHLY NOTICES of the ROYAL ASTRONOMICAL SOCIETY: LETTERS
    name = "mnras"; // Not a mistake! The letters should be listed as just MNRAS but with L in front of page(s)
    abbrev = pref + name + suff;
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bM(?:o[nthly]{0,5})?\.?\s*N(?:o[tices]{0,5})?\.?\s*(?:of\s+)?(?:the\s+)?R(?:o[yal]{0,3})?\.?\s*A(?:s[tro]{0,3})?(?:n[om]{0,2})?(?:ical)?\.?\s*S(?:o[ciety]{0,5})?\.?\s*:?\s*L(?:e[tters]{0,5})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    testLetters = getName.test(str);
    str = str.replace(getName, abbrev);
// Now need to insure that the page number has an "L" in front of it. If a page range is given, be sure to correct
// both numbers.
    if (testLetters) {
        getFirstPage = /pages\s=\s\{\s*(\d+)/;
        if (getFirstPage.test(str)) { str = str.replace(getFirstPage, "pages = \{L$1"); }
        getSecondPage = /pages\s=\s\{\s*(\S+)\s*-+\s*(\d+)/;
        if (getSecondPage.test(str)) { str = str.replace(getSecondPage, "pages = \{$1--L$2"); }
    }
// ----------------- NATURE
    name = "nat";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bNat(?:ure)?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- NEW ASTRONOMY
    name = "na";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?(?!n\s*a\S+)/
       ,/\bN[ew]{0,2}\.?\s*A(?:s[tro]{0,3})?(?:n[omy]{0,3})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- NEW ASTRONOMY REVIEW
    name = "nar";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bN[ew]{0,2}\.?\s*A(?:s[tro]{0,3})?(?:n[omy]{0,3})?\.?\s*R(?:e[view]{0,4})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- THE OBSERVATORY
    name = "obs";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bObs(?:e[rv]{0,2})?(?:atory)?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- PHYSICA SCRIPTA
    name = "physscr";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bPhys?(?:ica)?\.?\s*Scr(?:i[pta]{0,3})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- PHYSICAL REVIEW A:
    name = "pra";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bP(?:h[ys]{0,2})?(?:ical)?\.?\s*R(?:e[view]{0,4})?\.?\s*:?\s*A/
       ,/\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- PHYSICAL REVIEW B:
    name = "prb";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bP(?:h[ys]{0,2})?(?:ical)?\.?\s*R(?:e[view]{0,4})??\.?\s*:?\s*B/
       ,/\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- PHYSICAL REVIEW C
    name = "prc";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bP(?:h[ys]{0,2})?(?:ical)?\.?\s*R(?:e[view]{0,4})?\.?\s*:?\s*C/
       ,/\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- PHYSICAL REVIEW D
    name = "prd";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bP(?:h[ys]{0,2})?(?:ical)?\.?\s*R(?:e[view]{0,4})?\.?\s*:?\s*D/
       ,/\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- PHYSICAL REVIEW E
    name = "pre";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bP(?:h[ys]{0,2})?(?:ical)?\.?\s*R(?:e[view]{0,4})?\.?\s*:?\s*E/
       ,/\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- PHYSICAL REVIEW LETTERS
    name = "prl";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bP(?:h[ys]{0,2})?(?:ical)?\.?\s*R(?:e[view]{0,4})?\.?\s*:?\s*L(?:e[tters]{0,5})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- PHYSICS REPORTS
    name = "physrep";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bPhys(?:ics)?\.?\s*Rep(?:orts)?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- PIS'MA v ASTRONOMICHESKII ZHURNAL (English translation: Astronomy letters)
    name = "paz";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bP(?:i[s'ma]{0,4})?\.?\s*v?\s*A(?:s[tronomicheskii]{0,14})?\.?\s*Z(?:h[urnal]{0,5})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- PLANETARY AND SPACE SCIENCE
    name = "planss";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bPlan[etary]{0,5}\.?\s*(?:and\s+)?(?:&)?(?:\\&)?(?:\{\\&\})?\s*S[pace]{0,4}\.?\s*S[cience]{0,6}/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- PROCEEDINGS OF THE SOCIETY OF PHOTO-OPTICAL INSTRUMENTATION ENGINEERS
    name = "procspie";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bProc[eedings]{0,7}\.?\s*(?:of\s+)?(?:the\s+)?\s*S[ociety]{0,6}\.?\s*(?:of\s+)?\s*P[hoto\-optical]{0,13}\.?\s*I[nstrumentation]{0,14}\.?\s*E[ngineers]{0,8}/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- PUBLICATIONS OF THE ASJ
    name = "pasj";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bP(?:u[bli]{0,3})?(?:cations)?\.?\s*(?:of\s+)?(?:the\s+)?\s*A(?:s[tro]{0,3})?(?:n[om]{0,2})?(?:ical)?\.?\s*S[ociety]{0,6}\.?\s*(?:of\s+)?\s*J[apan]{0,4}/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- PUBLICATIONS OF THE ASP
    name = "pasp";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bP(?:u[bli]{0,3})?(?:c[at]{0,2})?(?:ions)?\.?\s*(?:of\s+)?(?:the\s+)?\s*A(?:s[tro]{0,3})?(?:n[om]{0,2})?(?:ical)?\.?\s*S[ociety]{0,6}\.?\s*(?:of\s+)?(?:the\s+)?P[acific]{0,6}/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- PUBLICATIONS OF THE ASTRONOMICAL SOCIETY OF AUSTRALIA
    name = "pasa";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bP(?:u[bli]{0,3})?(?:c[at]{0,2})?(?:ions)?\.?\s*(?:of\s+)?(?:the\s+)?\s*A(?:s[tro]{0,3})?(?:n[om]{0,2})?(?:ical)?\.?\s*S[ociety]{0,6}\.?\s*(?:of\s+)?A[ustralia]{0,8}/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- QUARTERLY JOURNAL OF THE RAS
    name = "qjras";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bQ[uarterly]{0,8}\.?\s*J(?:o[urn]{0,3})?(?:al)?\.?\s*(?:of\s+)?(?:the\s+)?R(?:o[yal]{0,3})?\.?\s*A(?:s[tro]{0,3})?(?:n[om]{0,2})?(?:ical)?\.?\s*S[ociety]{0,6}/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- REVISTA MEXICANA DE ASTRONOMIA Y ASTROFISICA
    name = "rmxaa";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bR[evista]{0,6}\.?\s*M[exicana]{0,7}\.?\s*(?:de\s+)?A[stronomia]{0,9}\.?\s*y?\s*A[strofisica]{0,10}/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- REVIEWS OF MODERN ASTRONOMY
    name = "rma";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bR[eviews]{0,6}\.?\s*(?:of\s+)?M[odern]{0,5}\.?\s*A(?:s[tro]{0,3})?(?:n[omy]{0,3})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- REVIEWS OF MODERN PHYSICS
    name = "rmp";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bR[eviews]{0,6}\.?\s*(?:of\s+)?M[odern]{0,5}\.?\s*P[hysics]{0,6}/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- SCIENCE
    name = "sci";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bSci[ence]{0,4}/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- SKY AND TELESCOPE
    name = "skytel";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bSky\s*(?:and\s+)?(?:&)?(?:\\&)?(?:\{\\&\})?\s*Tel[escope]{0,6}/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- SOLAR PHYSICS
    name = "solphys";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bSol[ar]{0,2}\.?\s*Phys[ics]{0,3}/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- SOVIET ASTRONOMY
    name = "sovast";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bSov[iet]{0,3}\.?\s*A(?:s[tro]{0,3})?(?:n[omy]{0,3})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- SPACE SCIENCE REVIEWS
    name = "ssr";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:the\s+)?(?:\\)?/
       ,/\bS[pace]{0,4}\.?\s*S[cience]{0,6}\.?\s*R[eviews]{0,6}/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- VISTAS IN ASTRONOMY
    name = "via";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bV[istas]{0,5}\.?\s*In?\.?\s*A(?:s[tro]{0,3})?(?:n[omy]{0,3})?/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
// ----------------- ZEITSCHRIFT FUER ASTROPHYSIK
    name = "zap";
    abbrev = pref + name + suff;
    journalList.push(name);
    getName = new RegExp([
        /journal\s=\s\{\s*(?:\\)?/
       ,/\bZ[eitschrift]{0,10}\.?\s*(?:F[uer]{0,3})?\.?\s*A[stro]{0,4}p[hysik]{0,5}/
       ,/\.?\s*\}/].map(function(r) {return r.source;}).join(''), "i");
    str = str.replace(getName, abbrev);
   return [str,journalList];
}
// ////////////////////////////////// END (FIXJOURNAL) //////////////////////////////////////


// /////////////////////////////////////////// STATUSMSG //////////////////////////////////////////////
// Matches up the status code (passed argument) to the list of possibilities and alerts the user of what
// the error is.
// ////////////////////////////////////////////////////////////////////////////////////////////////////
function statusMsg(statCode) {
      m200 = "OK - The request was successful";
      m201 = "Created - The request has been fulfilled and resulted in a new resource being created. "
             + "The newly created resource can be referenced by the URI/s returned in the Location header.";
      m204 = "No content - The request was successful and no extra info will be provided by Mendeley in the body of the response.";
      m400 = "Bad Request - The request you sent to the Mendeley server is invalid.";
//      m401 = "Unauthorized - Your Mendeley API key is wrong.";
      m401 = "In the next popup window, please log into Mendeley to provide MendBib authorization to access the library.";
      m403 = "Forbidden - Access to the Mendeley resource is not allowed.";
      m404 = "Not Found - The resource you were requesting cannot be found by Mendeley.";
      m405 = "Method Not Allowed - The HTTP method (GET/POST/PUT/PATCH/DELETE) is not valid for this Mendeley resource.";
      m406 = "Not Acceptable - The media type in the Accept header is not valid for this Mendeley resource.";
      m409 = "Conflict - The Mendeley resource conflicts with one that already exists.";
      m412 = "Precondition Failed with Mendeley API call.";
      m415 = "Unsupported Media Type - The media type in the Content-Type header is not valid for this Mendeley resource.";
      m422 = "Unprocessable Entity - The Mendeley server understands the request entity but it was "
             +"semantically erroneous. See RFC-4918.";
      m429 = "Too many requests - Mendeley has rate liited you.  Contact api-support@mendeley.com";
      m500 = "Internal Server Error - Mendeley had a problem with its server. Try again later. (Your group ID may have a typo.)";
      m503 = "Service Unavailable - Mendeley is temporarily offline for maintanance. Please try again later.";

      var msg = "";
      if (statCode == 200) {msg = m200;}
      if (statCode == 201) {msg = m201;}
      if (statCode == 204) {msg = m204;}
      if (statCode == 400) {msg = m400;}
      if (statCode == 401) {msg = m401;}
      if (statCode == 403) {msg = m403;}
      if (statCode == 404) {msg = m404;}
      if (statCode == 405) {msg = m405;}
      if (statCode == 406) {msg = m406;}
      if (statCode == 409) {msg = m409;}
      if (statCode == 412) {msg = m412;}
      if (statCode == 415) {msg = m415;}
      if (statCode == 422) {msg = m422;}
      if (statCode == 429) {msg = m429;}
      if (statCode == 500) {msg = m500;}
      if (statCode == 503) {msg = m503;}
      alert(msg);
}
// //////////////////////////////////////// END (STATUSMSG) //////////////////////////////////////////


// ////////////////////////////////////////// IGNOREWORDS ////////////////////////////////////////////
// Takes a string, like a title, that has words separated by white space.  Returns the first non-trivial
// word, where trivial words are defined in the list below.
// ///////////////////////////////////////////////////////////////////////////////////////////////////
function ignoreWords(phrase)
{
// Note: there is probably a much better way to do this! below are all the words I would
// rather not show up as the 1 word representative of the title.  The hope is that by
// eliminating the below as possibilities, the one word that gets chosen will be substantive
// enough to indicate what the topic of the book is about.
//
// CAUTION:  if the below list is added to or subtracted from over time, the resulting
// bibtex file could generate a citekey for books that would differ from the citekey
// that represented those same reference entries in past bibtex versions, rendering any
// older latex papers that use the NEWly-generated bibtex with errors (e.g., the cite refs
// won't exist in the new bibtex file.)
// We are going to just take the first non-trivial word of the title to use for the citekey.
// Note that the below list is rather strict in the sense that lots of words that people
// might consider to be NOT trivial are considered insignificant below.  For example,
// "introduction" might not seem trivial.  Because I want the code to home in on the introduction
// of WHAT, rather than "introduction", I have opted to include "introduction" in the below blacklisted
// words. Your mileage may vary, and the below can be easily edited (just keep in mind the
// above cautionary note about backward-compatibility with changed citekeys).
    var indivWords = phrase.split(" ");
    for (var i = 0; i < indivWords.length; i++) {indivWords[i] = indivWords[i].toLowerCase().trim();}
    var firstWord = "";
    var wcnt = 0;
    var insigWords =
         '|0|1|2|3|4|5|6|7|8|9|10|'
       + 'i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii|xiii|ivx|'
       + '0.|1.|2.|3.|4.|5.|6.|7.|8.|9.|10.|'
       + 'i.|ii.|iii.|iv.|v.|vi.|vii.|viii.|ix.|x.|xi.|xii.|xiii.|ivx.|'
       + '1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th|11th|12th|13th|14th|15th|16th|17th|18th|19th|20th|21th|22nd|23rd|24th|25th|'
       + 'first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|'
       + 'a|about|all|an|annals|annual|any|applied|are|article|'
       + 'basic|beside|between|'
       + 'call|chapter|chapters|college|concise|conference|'
       + 'dependence|describing|detailed|detecting|detection|detect|detections|development|do|doctor|does|'
       + 'each|every|'
       + 'for|formation|from|'
       + 'how|'
       + 'in|international|investigating|investigation|'
       + 'journal|just|'
       + 'if|insight|insights|into|introduction|intro|introductory|is|it|'
       + 'lecture|lectures|'
       + 'major|measuring|measure|measures|measurements|measurement|method|methods|minor|modern|monthly|multiple|'
       + 'news|note|notices|'
       + 'observe|observations|observation|observing|observed|of|on|out|'
       + 'part|proceedings|progress|properties|property|publication|publications|pushing|'
       + 'reference|relation|relationship|relations|relationships|report|review|'
       + 'simple|society|some|study|studies|summary|'
       + 'the|that|they|thesis|this|to|trend|trends|turns|'
       + 'university|update|use|using|'
       + 'was|were|what|when|where|why|with|'
       + 'z|';
    while (firstWord == "" && wcnt < indivWords.length) {
	       if (insigWords.indexOf("|"+indivWords[wcnt].trim()+"|") != -1) {
// the word shows up among the insigificant words, so keep hunting
	           wcnt = wcnt + 1;
	       } else {
// the word appears to be the first significant word, as there is no match with the insigWords list
               firstWord = indivWords[wcnt].trim();
           }
    }
    if (firstWord == "" && indivWords.length > 0) {firstWord = indivWords[0];}
// above line covers case that if you've blown away everything, just revert to first word even if it is insignificant
    return firstWord;
}
// /////////////////////////////////////// END(IGNOREWORDS) /////////////////////////////////////


// /////////////////////////////////////////// SORTINDICES ///////////////////////////////////////////
// returns an array of indices that, when applied to either Arr1 or Arr2, sort those arrays in either
// alphabetical order or in numerical order.
// //////////////////////////////////////////////////////////////////////////////////////////////////
function sortIndices(arr1, arr1Type, arr2, arr2Type) {
    var len = arr1.length;
    var indices = new Array(len);
    for (var i = 0; i < len; i++) {indices[i] = i;}
    indices.sort(function (a,b) {
         if (arr1[a] == arr1[b] ) {
	         if (arr2Type == "s") {
  	             return (arr2[a] < arr2[b]) ? -1 : (arr2[a] > arr2[b]) ? 1 : 0;
	         } else {return (arr2[a] - arr2[b]);}
         } else {
	         if (arr1Type == "s") {
	             return (arr1[a] < arr1[b]) ? -1 : 1;
             } else {return (arr1[a] - arr2[b]);}
	     }
    });
    return indices;
}
// //////////////////////////////////// END(SORTINDICES) /////////////////////////////////////////////

// /////////////////////////////////////  FIXSPECIALCHARS /////////////////////////////////////////
// Returns a paired array of unicode symbol values with the latex they should be replaced with
// ///////////////////////////////////////////////////////////////////////////////////////////
function fixSpecialChars(bib, version) {
    newBib = bib;
    var getUniCode = /[\u{00A0}-\u{D7FF}]/um;
    var uniMap = uniCodeMap();
    var option = 0;
    if (version != "latex") {option = 1;}
    while (getUniCode.test(newBib)) {
	       var tmp = newBib.replace(getUniCode, function(str, o, s){
                                                          if (str in uniMap) {return uniMap[str][option];
                                                          } else {return "XxX";}
                                                });
// implicitly passed are the matching string, position o fthe match, and the source string
// see https://javascript.info/regexp-methods
           newBib = tmp.trim();
   }
// There is a remaining concern, if the version is "ascii":  latex code that may have already
// been present in the bib text when it came from Mendeley.  All that latex code needs to be
// stripped so that nothing weird ends up in the citeKey.  Proceed with the stripping ...
// One assumption is that latex code starts with "\\" and that curly brackets are involved.
// There may be cases of {\something{something else}}  or just \something{something else}.
// We have to catch both varieties.  We will substitute the latex code for whatever is
// in "something else".  If there is no something else, for example {\ldots}  or even just
// \ldots, we will have to recognize this word as latex and replace with "".
    if (version == "ascii") {
// Must watch out for what is likely to be a rare case:  the situation in which the bib already
// has a aastex-compliant entry in its journal field, eg "journal = {\apj},"
// In this case, we would not want to mis-interpret the {\apj} as a latex code to be replaced
// with "", as being left with "journal = ,"  would break the bib completely.  So need to catch
// this special case and just remove the "\".  The fixJournal looks for such things, but fixJournal
// is run after the call to this function (I think).  So, just to be safe, look for and guard
// against this possible catastrophy. Se below looks for occurances of " = { \something "
// and replaces with " = {something"
// below regex says: keep matching until you encounter a white space or a right or a left curly bracket
        var latexSearch = /\s=\s\{\s*\\([^\s\{\}]+)/;
        while (latexSearch.test(newBib)) { newBib = newBib.replace(latexSearch, " = \{$1");}
// now look for " = { \something{ something else }" and replace with " = {something else"
// below regex says: after a " = "{, match to possible white space followed by a backslash and keep
// matching until a white space or right/left curly bracket is encoutered. These characters should
// then be followed by a right curly bracket, then by possible white space, then continue matching
// characters until a line return, new line, tab, form feed, vertical space, left or right curly
// bracket is encoutered. Note that in this case, white space is OK.  Those characters are to be
// followed by a closing curly bracket if a true match.  This strict code prevents the last curly
// bracket from latching on to the last of several possible curly brackets in a row in a complex
// string with a lot of latex code.
        latexSearch = /\s=\s\{\s*\\[^\s\{\}]+\{\s*([^\r\n\t\f\v\{\}]+)\s*\}/;
        while (latexSearch.test(newBib)) { newBib = newBib.replace(latexSearch, " = \{$1");}
// Look for occuraces of { \something{ somethingelse } } and turn into somthingelse.
        latexSearch = /\{\s*\\[^\s\{\}]+\{\s*([^\r\n\t\f\v\{\}]+)\s*\}\s*\}/;
        while (latexSearch.test(newBib)) { newBib = newBib.replace(latexSearch, "$1");}
// Now look for occurances of \something{ somethingelse } and replace with somethingelse
        latexSearch = /\\[^\s\{\}]+\{\s*([^\r\n\t\f\v\{\}]+)\s*\}/;
        while (latexSearch.test(newBib)) { newBib = newBib.replace(latexSearch, "$1"); }
// Now look for occurances of { \something } and replace with "something"
        latexSearch = /\{\s*\\([^\s\{\}])+\}/;
        while (latexSearch.test(newBib)) { newBib = newBib.replace(latexSearch, "$1"); }
// Now look for occurances of \something and replace with ""
        latexSearch = /\\([^\s\{\}]+)/;
        while (latexSearch.test(newBib)) { newBib = newBib.replace(latexSearch, "$1"); }
// If we were left with some empty space between the curly brackets of the fields, remove the space
        var tmp = newBib.split("\{ ");
        newBib = tmp[0];
        for (var i=1; i < tmp.length; i++) {newBib = newBib + "\{" + tmp[i];}
        var tmp = newBib.split(" \}");
        newBib = tmp[0];
        for (var i=1; i < tmp.length; i++) {newBib = newBib + "\}" + tmp[i];}
    }
    return newBib;
}
// ////////////////////////////////  END(FIXSPECIALCHARS) /////////////////////////////////////


// ////////////////////////////////// REMOVEUNWANTEDSECTIONS //////////////////////////////////////
// Remove the sections of the bib that are unnecessary, like urls, abstracts, annotations, etc. In
// the latest version of the bib straight from Mendeley, a lot of these items are no longer present,
// but no harm in keeping the check for them in here, in case this routine is needed for other
// applications that DOES have those unwanted items.
// ////////////////////////////////////////////////////////////////////////////////////////////////
function removeUnwantedSections(bib, refType) {
    var str = bib;
    if (!refType) {refType = "";} // initialize refType to "" if not provided, in which case nothing will be removed
// Remove any unnecesary sections
// url, isbn, issn, keywords,eprint, primaryClass, archivePrefix, pmid
// can easily add to the list below.  Because references to software requires a URL for a complete
// reference, keep the URL in the case of a "misc" entry type.
    var removeAbstract = /\s{4}abstract\s=\s\{.+\},?\n/gmui;
    var removeArchive = /\s{4}archivePrefix\s=\s\{.+\},?\n/gmui;
    var removeEprint = /\s{4}eprint\s=\s\{.+\},?\n/gmui;
    var removeKeywords = /\s{4}keywords\s=\s\{.+\},?\n/gmui;
    var removeFile = /\s{4}file\s=\s\{.+\},?\n/gmui;
    var removeNumber = /\s{4}number\s=\s\{.+\},?\n/gmui;
    var removeAnnote = /\s{4}annote\s=\s\{.+\},?\n/gmui;
    var removePrimary = /\s{4}primaryClass\s=\s\{.+\},?\n/gmui;
    var removeTags = /\s{4}mendeley-tags\s=\s\{.+\},?\n/gmui;
    var removePmid = /\s{4}pmid\s=\s\{.+\},?\n/gmui;
    var removeUrl = /\s{4}url\s=\s\{.+\},?\n/gmui;
    var removeIssn = /\s{4}issn\s=\s\{.+\},?\n/gmui;
    var removeIsbn = /\s{4}isbn\s=\s\{.+\},?\n/gmui;
    var removeMonth = /\s{4}month\s=\s\{.+\},?\n/gmui;
    var removeArxivid = /\s{4}arxivId\s=\s\{.+\},?\n/gmui;
// for all refTypes, remove the following:
    str = str.replace(removeAbstract, '');
    str = str.replace(removeArchive, '');
    str = str.replace(removeEprint, '');
    str = str.replace(removeKeywords, '');
    str = str.replace(removeFile, '');
    str = str.replace(removeNumber, '');
    str = str.replace(removeAnnote, '');
    str = str.replace(removePrimary, '');
    str = str.replace(removeTags, '');
    str = str.replace(removePmid, '');
// for  refType of "misc", only remove the following (keep URL, arxivid, and month because might be reference
// to software package for which such info is needed).
    if (refType.toLowerCase() == "misc") {
        str = str.replace(removeIssn, '');
        str = str.replace(removeIsbn, '');
// if a book, a book section, a thesis or a technical report, remove URL but keep Issn, Isbn, month
    } else if (refType.toLowerCase() != "article") {
        str = str.replace(removeUrl, '');
// if a journal article, remove URL, Issn, Isbn, Month, arxivId
    } else if (refType.toLowerCase() == "article") {
        str = str.replace(removeIssn, '');
        str = str.replace(removeIsbn, '');
        str = str.replace(removeMonth, '');
        str = str.replace(removeUrl, '');
        str = str.replace(removeArxivid, '');
    }
// Some fields ended up at the end of the entry, but left with a comma that needs to be removed since
// there are no fields following that field, for that bibliographic entry. Identify those cases and
// remove the offending comma.
    var removeLastComma = /\},(\n\})/mu;
    str = str.replace(removeLastComma, "\}$1");
// https://stackoverflow.com/questions/12317049/how-to-split-a-long-regular-expression-into-multiple-lines-in-javascript
// helped with developing the RegEx removeSections above.
// https://regex101.com/  was incredibly helpful in testing the regex
// https://www.bennadel.com/blog/161-ask-ben-javascript-replace-and-multiple-lines-line-breaks.htm
// provided guidance regarding how to remove the line breaks associated with the lines that
// needed to be removed
    return str;
}
// //////////////////////////////// END (REMOVEUNWANTEDSECTIONS) //////////////////////////////////


// /////////////////////////////////////  UNICODEMAP /////////////////////////////////////////
// Returns an associative array between the unicode and corresponding latex code, with paired
// keys and values.
// //////////////////////////////////////////////////////////////////////////////////////////
function uniCodeMap() {
// Take care of any weird unicode symbols. New mapping table based on that from Matthias Steffens,
// then enhanced with some fields generated from the unicode table. taken from
// https://gist.github.com/anonymous/2724474  (bibtex.js)
// https://unicode-table.com/en/#basic-latin
// below is a huge javascript "associative array", a set of key value pairs.
    var uniMap = {
	     "\u00A0":["~", ""], // NO-BREAK SPACE
	     "\u00A1":["{\\textexclamdown}", ""], // INVERTED EXCLAMATION MARK
	     "\u00AF":["{\\textasciimacron}", ""], // MACRON
	     "\u00B0":["{\\textdegree}", " "], // DEGREE SIGN
	     "\u00B1":["{\\textpm}", " "], // PLUS-MINUS SIGN
	     "\u00B2":["{\\texttwosuperior}", ""], // SUPERSCRIPT TWO
       	 "\u00B3":["{\\textthreesuperior}", ""], // SUPERSCRIPT THREE
	     "\u00B4":["{\\textasciiacute}", ""], // ACUTE ACCENT
	     "\u00B5":["{\\textmu}", ""], // MICRO SIGN
	     "\u00B7":["{\\textperiodcentered}", ""], // MIDDLE DOT
	     "\u00B8":["{\\c\\ }", "c"], // CEDILLA
	     "\u00B9":["{\\textonesuperior}", ""], // SUPERSCRIPT ONE
	     "\u00BC":["{\\textonequarter}", " "], // VULGAR FRACTION ONE QUARTER
	     "\u00BD":["{\\textonehalf}", " "],// VULGAR FRACTION ONE HALF
	     "\u00BE":["{\\textthreequarters}", " "], // VULGAR FRACTION THREE QUARTERS
	     "\u00BF":["{\\textquestiondown}", ""], // INVERTED QUESTION MARK
         "\u00C0":["{\\`{A}}", "A"], //accented capital ` A
	     "\u00C1":["{\\'{A}}", "A"], //accented capital A in other direction
         "\u00C2":["{\\^{A}}", "A"], //accented capital A with hat
         "\u00C3":["{\\~{A}}", "A"], // accented capital A with tilde
         "\u00C4":["{\\\"{A}}", "A"], // accented capital A with 2 dots
         "\u00C5":["{\\AA}", "A"], // accented capital A with degree sign like angstrom
	     "\u00C6":["{\\AE}", "AE"], // LATIN CAPITAL LETTER AE
	     "\u00D0":["{\\DH}", "DH"], // LATIN CAPITAL LETTER ETH
	     "\u00D7":["{\\texttimes}", ""], // MULTIPLICATION SIGN
	     "\u00D8":["{\\O}", "O"], // LATIN CAPITAL LETTER O WITH STROKE
	     "\u00DE":["{\\TH}", "TH"], // LATIN CAPITAL LETTER THORN
	     "\u00DF":["{\\ss}", "s"], // LATIN SMALL LETTER SHARP S
	     "\u00E6":["{\\ae}", "ae"],// LATIN SMALL LETTER AE
	     "\u00F0":["{\\dh}", "dh"], // LATIN SMALL LETTER ETH
	     "\u00F7":["{\\textdiv}", ""], // DIVISION SIGN
	     "\u00F8":["{\\o}", "o"], // LATIN SMALL LETTER O WITH STROKE
	     "\u00FE":["{\\th}", "th"], // LATIN SMALL LETTER THORN
	     "\u0131":["{\\i}", "i"], // LATIN SMALL LETTER DOTLESS I
	     "\u0132":["IJ", "IJ"], // LATIN CAPITAL LIGATURE IJ
	     "\u0133":["ij", "ij"], // LATIN SMALL LIGATURE IJ
	     "\u0138":["k", "k"], // LATIN SMALL LETTER KRA
	     "\u0149":["'n", "n"], // LATIN SMALL LETTER N PRECEDED BY APOSTROPHE
	     "\u014A":["{\\NG}", "NG"], // LATIN CAPITAL LETTER ENG
	     "\u014B":["{\\ng}", "ng"], // LATIN SMALL LETTER ENG
	     "\u0152":["{\\OE}", "OE"], // LATIN CAPITAL LIGATURE OE
	     "\u0153":["{\\oe}", "oe"], // LATIN SMALL LIGATURE OE
	     "\u017F":["s", "s"], // LATIN SMALL LETTER LONG S
	     "\u02B9":["'", ""], // MODIFIER LETTER PRIME
	     "\u02BB":["'", ""], // MODIFIER LETTER TURNED COMMA
	     "\u02BC":["'", ""], // MODIFIER LETTER APOSTROPHE
	     "\u02BD":["'", ""], // MODIFIER LETTER REVERSED COMMA
	     "\u02C6":["{\\textasciicircum}", ""], // MODIFIER LETTER CIRCUMFLEX ACCENT
	     "\u02C8":["'", " "], // MODIFIER LETTER VERTICAL LINE
	     "\u02C9":["-", " "], // MODIFIER LETTER MACRON
	     "\u02CC":[",", " "], // MODIFIER LETTER LOW VERTICAL LINE
	     "\u02D0":[":", " "], // MODIFIER LETTER TRIANGULAR COLON
	     "\u02DA":["o", ""], // RING ABOVE
	     "\u02DC":["\\~{}", ""], // SMALL TILDE
	     "\u02DD":["{\\textacutedbl}", ""], // DOUBLE ACUTE ACCENT
	     "\u0374":["'", ""], // GREEK NUMERAL SIGN
	     "\u0375":[",", ""], // GREEK LOWER NUMERAL SIGN
	     "\u037E":[";", ""], // GREEK QUESTION MARK
	     "\u2010":["-", " "], // HYPHEN
	     "\u2011":["-", " "], // NON-BREAKING HYPHEN
	     "\u2012":["-", " "], // FIGURE DASH
	     "\u2013":["{\\textendash}", " "], // EN DASH
	     "\u2014":["{\\textemdash}", " "], // EM DASH
	     "\u2015":["{\\textemdash}", " "], // HORIZONTAL BAR or QUOTATION DASH (not in LaTeX -- use EM DASH)
	     "\u2018":["{\\textquoteleft}", ""], // LEFT SINGLE QUOTATION MARK
	     "\u2019":["{\\textquoteright}", ""], // RIGHT SINGLE QUOTATION MARK
	     "`" : ["{\\textquoteleft}", ""], // LEFT SINGLE QUOTATION MARK
	     "'" : ["{\\textquoteright}", ""], // RIGHT SINGLE QUOTATION MARK
	     "\u201A":["{\\quotesinglbase}", ""], // SINGLE LOW-9 QUOTATION MARK
	     "\u201B":["'", ""], // SINGLE HIGH-REVERSED-9 QUOTATION MARK
	     "\u201C":["{\\textquotedblleft}", ""], // LEFT DOUBLE QUOTATION MARK
	     "\u201D":["{\\textquotedblright}", ""], // RIGHT DOUBLE QUOTATION MARK
	     "\u201E":["{\\quotedblbase}", ""], // DOUBLE LOW-9 QUOTATION MARK
	     "\u201F":["{\\quotedblbase}", ""], // DOUBLE HIGH-REVERSED-9 QUOTATION MARK
         "\u2020":["{\\textdagger}", " "], // DAGGER
	     "\u2021":["{\\textdaggerdbl}", " "], // DOUBLE DAGGER
	     "\u2022":["{\\textbullet}", " "], // BULLET
	     "\u2024":[".", " "], // ONE DOT LEADER
	     "\u2026":["{\\textellipsis}", " "], // HORIZONTAL ELLIPSIS
	     "\u2027":["-", " "], // HYPHENATION POINT
	     "\u2032":["'", ""], // PRIME
	     "\u2033":["'", ""], // DOUBLE PRIME
	     "\u2035":["`", ""], // REVERSED PRIME
	     "\u2036":["``", ""], // REVERSED DOUBLE PRIME
	     "\u2043":["-", " "], // HYPHEN BULLET // works here
	     "\u2044":["{\\textfractionsolidus}", " "], // FRACTION SLASH
	     "\u2070":["$^{0}$", "_0"], // SUPERSCRIPT ZERO
	     "\u2074":["$^{4}$", "_4"], // SUPERSCRIPT FOUR
	     "\u2075":["$^{5}$", "_5"], // SUPERSCRIPT FIVE
	     "\u2076":["$^{6}$", "_6"], // SUPERSCRIPT SIX
	     "\u2077":["$^{7}$", "_7"], // SUPERSCRIPT SEVEN
	     "\u2078":["$^{8}$", "_8"], // SUPERSCRIPT EIGHT
	     "\u2079":["$^{9}$", "_9"], // SUPERSCRIPT NINE
	     "\u207A":["$^{+}$", ""], // SUPERSCRIPT PLUS SIGN
	     "\u207B":["$^{-}$", ""], // SUPERSCRIPT MINUS
	     "\u207C":["$^{=}$", ""], // SUPERSCRIPT EQUALS SIGN
	     "\u207D":["$^{(}$", ""], // SUPERSCRIPT LEFT PARENTHESIS
	     "\u207E":["$^{)}$", ""], // SUPERSCRIPT RIGHT PARENTHESIS
	     "\u207F":["$^{n}$", "n"], // SUPERSCRIPT LATIN SMALL LETTER N
	     "\u2080":["$_{0}$", "_0"], // SUBSCRIPT ZERO
	     "\u2081":["$_{1}$", "_1"], // SUBSCRIPT ONE
	     "\u2082":["$_{2}$", "_2"], // SUBSCRIPT TWO
	     "\u2083":["$_{3}$", "_3"], // SUBSCRIPT THREE
	     "\u2084":["$_{4}$", "_4"], // SUBSCRIPT FOUR
	     "\u2085":["$_{5}$", "_5"], // SUBSCRIPT FIVE
	     "\u2086":["$_{6}$", "_6"], // SUBSCRIPT SIX
	     "\u2087":["$_{7}$", "_7"], // UBSCRIPT SEVEN
	     "\u2088":["$_{8}$", "_8"], // SUBSCRIPT EIGHT
	     "\u2089":["$_{9}$", "_9"], // SUBSCRIPT NINE
	     "\u208A":["$_{+}$", " "], // SUBSCRIPT PLUS SIGN
	     "\u208B":["$_{-}$", " "], // SUBSCRIPT MINUS
	     "\u208C":["$_{=}$", " "], // SUBSCRIPT EQUALS SIGN
	     "\u208D":["$_{(}$", " "], // SUBSCRIPT LEFT PARENTHESIS
	     "\u208E":["$_{)}$", " "], // SUBSCRIPT RIGHT PARENTHESIS
	     "\u2103":["{\\textcelsius}", "Celsius"], // DEGREE CELSIUS
	     "\u2109":["F", "Fahrenheit"], // DEGREE FAHRENHEIT
	     "\u2126":["{\\textohm}", "Ohm"], // OHM SIGN
	     "\u212A":["K", "Kelvin"], // KELVIN SIGN
	     "\u212B":["A", "Angstrom"], // ANGSTROM SIGN
	     "\u212E":["{\\textestimated}", " "], // ESTIMATED SYMBOL
	     "\u2153":[" 1/3", " "], // VULGAR FRACTION ONE THIRD
	     "\u2154":[" 2/3", " "], // VULGAR FRACTION TWO THIRDS
	     "\u2155":[" 1/5", " "], // VULGAR FRACTION ONE FIFTH
	     "\u2156":[" 2/5", " "], // VULGAR FRACTION TWO FIFTHS
	     "\u2157":[" 3/5", " "], // VULGAR FRACTION THREE FIFTHS
	     "\u2158":[" 4/5", " "], // VULGAR FRACTION FOUR FIFTHS
	     "\u2159":[" 1/6", " "], // VULGAR FRACTION ONE SIXTH
	     "\u215A":[" 5/6", " "], // VULGAR FRACTION FIVE SIXTHS
	     "\u215B":[" 1/8", " "], // VULGAR FRACTION ONE EIGHTH
	     "\u215C":[" 3/8", " "], // VULGAR FRACTION THREE EIGHTHS
	     "\u215D":[" 5/8", " "], // VULGAR FRACTION FIVE EIGHTHS
	     "\u215E":[" 7/8", " "], // VULGAR FRACTION SEVEN EIGHTHS
	     "\u215F":[" 1/", " "], // FRACTION NUMERATOR ONE
	     "\u2160":["I", " "], // ROMAN NUMERAL ONE
	     "\u2161":["II", " "], // ROMAN NUMERAL TWO
	     "\u2162":["III", " "], // ROMAN NUMERAL THREE
	     "\u2163":["IV", " "], // ROMAN NUMERAL FOUR
	     "\u2164":["V", " "], // ROMAN NUMERAL FIVE
	     "\u2165":["VI", " "], // ROMAN NUMERAL SIX
	     "\u2166":["VII", " "], // ROMAN NUMERAL SEVEN
	     "\u2167":["VIII", " "], // ROMAN NUMERAL EIGHT
	     "\u2168":["IX", " "], // ROMAN NUMERAL NINE
	     "\u2169":["X", " "], // ROMAN NUMERAL TEN
	     "\u216A":["XI", " "], // ROMAN NUMERAL ELEVEN
	     "\u216B":["XII", " "], // ROMAN NUMERAL TWELVE
	     "\u216C":["L", " "], // ROMAN NUMERAL FIFTY
	     "\u216D":["C", " "], // ROMAN NUMERAL ONE HUNDRED
	     "\u216E":["D", " "], // ROMAN NUMERAL FIVE HUNDRED
	     "\u216F":["M", " "], // ROMAN NUMERAL ONE THOUSAND
	     "\u2170":["i", " "], // SMALL ROMAN NUMERAL ONE
	     "\u2171":["ii", " "], // SMALL ROMAN NUMERAL TWO
	     "\u2172":["iii", " "], // SMALL ROMAN NUMERAL THREE
	     "\u2173":["iv", " "], // SMALL ROMAN NUMERAL FOUR
	     "\u2174":["v", " "], // SMALL ROMAN NUMERAL FIVE
	     "\u2175":["vi", " "], // SMALL ROMAN NUMERAL SIX
	     "\u2176":["vii", " "], // SMALL ROMAN NUMERAL SEVEN
	     "\u2177":["viii", " "], // SMALL ROMAN NUMERAL EIGHT
	     "\u2178":["ix", " "], // SMALL ROMAN NUMERAL NINE
	     "\u2179":["x", " "], // SMALL ROMAN NUMERAL TEN
	     "\u217A":["xi", " "], // SMALL ROMAN NUMERAL ELEVEN
	     "\u217B":["xii", " "], // SMALL ROMAN NUMERAL TWELVE
	     "\u217C":["l", " "], // SMALL ROMAN NUMERAL FIFTY
	     "\u217D":["c", " "], // SMALL ROMAN NUMERAL ONE HUNDRED
	     "\u217E":["d", " "], // SMALL ROMAN NUMERAL FIVE HUNDRED
	     "\u217F":["m", " "], // SMALL ROMAN NUMERAL ONE THOUSAND
	     "\u2190":["{\\textleftarrow}", " "], // LEFTWARDS ARROW
	     "\u2191":["{\\textuparrow}", " "], // UPWARDS ARROW
	     "\u2192":["{\\textrightarrow}", " "], // RIGHTWARDS ARROW
	     "\u2193":["{\\textdownarrow}", " "], // DOWNWARDS ARROW
   	     "\u2194":["{\\leftrightarrow", " "], // LEFT RIGHT ARROW
	     "\u2212":["-", " "], // MINUS SIGN
	     "\u2215":["/", " "], // DIVISION SLASH
	     "\u221E":["$\\infty$", "infinity"], // INFINITY
	     "\u2236":[":", " "], // RATIO
	     "\u2613":["X", " "], // SALTIRE
	     "\uFB00":["ff", "ff"], // LATIN SMALL LIGATURE FF
	     "\uFB01":["fi", "fi"], // LATIN SMALL LIGATURE FI
	     "\uFB02":["fl", "fl"], // LATIN SMALL LIGATURE FL
	     "\uFB03":["ffi", "ffi"], // LATIN SMALL LIGATURE FFI
	     "\uFB04":["ffl", "ffl"], // LATIN SMALL LIGATURE FFL
	     "\uFB05":["st", "st"], // LATIN SMALL LIGATURE LONG S T
	     "\uFB06":["st", "st"], // LATIN SMALL LIGATURE ST
// Derived accented characters
// These two require the "semtrans" package to work; uncomment to enable
//	"\u02BF":["\{\\Ayn}", "A"], // MGR Ayn
//	"\u02BE":["\{\\Alif}", "A"], // MGR Alif/Hamza
	     "\u00C0":["\\`{A}", "A"], // LATIN CAPITAL LETTER A WITH GRAVE
	     "\u00C1":["\\'{A}", "A"], // LATIN CAPITAL LETTER A WITH ACUTE
	     "\u00C2":["\\^{A}", "A"], // LATIN CAPITAL LETTER A WITH CIRCUMFLEX
	     "\u00C3":["\\~{A}", "A"], // LATIN CAPITAL LETTER A WITH TILDE
	     "\u00C4":["\\\"{A}", "A"], // LATIN CAPITAL LETTER A WITH DIAERESIS
	     "\u00C5":["\\r{A}", "A"], // LATIN CAPITAL LETTER A WITH RING ABOVE
	     "\u00C7":["\\c{C}", "C"], // LATIN CAPITAL LETTER C WITH CEDILLA
	     "\u00C8":["\\`{E}", "E"], // LATIN CAPITAL LETTER E WITH GRAVE
	     "\u00C9":["\\'{E}", "E"], // LATIN CAPITAL LETTER E WITH ACUTE
	     "\u00CA":["\\^{E}", "E"], // LATIN CAPITAL LETTER E WITH CIRCUMFLEX
	     "\u00CB":["\\\"{E}", "E"], // LATIN CAPITAL LETTER E WITH DIAERESIS
	     "\u00CC":["\\`{I}", "I"], // LATIN CAPITAL LETTER I WITH GRAVE
	     "\u00CD":["\\'{I}", "I"], // LATIN CAPITAL LETTER I WITH ACUTE
	     "\u00CE":["\\^{I}", "I"], // LATIN CAPITAL LETTER I WITH CIRCUMFLEX
	     "\u00CF":["\\\"{I}", "I"], // LATIN CAPITAL LETTER I WITH DIAERESIS
	     "\u00D1":["\\~{N}", "N"], // LATIN CAPITAL LETTER N WITH TILDE
	     "\u00D2":["\\`{O}", "O"], // LATIN CAPITAL LETTER O WITH GRAVE
	     "\u00D3":["\\'{O}", "O"], // LATIN CAPITAL LETTER O WITH ACUTE
 	     "\u00D4":["\\^{O}", "O"], // LATIN CAPITAL LETTER O WITH CIRCUMFLEX
	     "\u00D5":["\\~{O}", "O"], // LATIN CAPITAL LETTER O WITH TILDE
	     "\u00D6":["\\\"{O}", "O"], // LATIN CAPITAL LETTER O WITH DIAERESIS
	     "\u00D9":["\\`{U}", "U"], // LATIN CAPITAL LETTER U WITH GRAVE
	     "\u00DA":["\\'{U}", "U"], // LATIN CAPITAL LETTER U WITH ACUTE
	     "\u00DB":["\\^{U}", "U"], // LATIN CAPITAL LETTER U WITH CIRCUMFLEX
	     "\u00DC":["\\\"{U}", "U"], // LATIN CAPITAL LETTER U WITH DIAERESIS
	     "\u00DD":["\\'{Y}", "Y"], // LATIN CAPITAL LETTER Y WITH ACUTE
	     "\u00E0":["\\`{a}", "a"], // LATIN SMALL LETTER A WITH GRAVE
	     "\u00E1":["\\'{a}", "a"], // LATIN SMALL LETTER A WITH ACUTE
	     "\u00E2":["\\^{a}", "a"], // LATIN SMALL LETTER A WITH CIRCUMFLEX
	     "\u00E3":["\\~{a}", "a"], // LATIN SMALL LETTER A WITH TILDE
	     "\u00E4":["\\\"{a}", "a"], // LATIN SMALL LETTER A WITH DIAERESIS
	     "\u00E5":["\\r{a}", "a"], // LATIN SMALL LETTER A WITH RING ABOVE
	     "\u00E7":["\\c{c}", "c"], // LATIN SMALL LETTER C WITH CEDILLA
	     "\u00E8":["\\`{e}", "e"], // LATIN SMALL LETTER E WITH GRAVE
	     "\u00E9":["\\'{e}", "e"], // LATIN SMALL LETTER E WITH ACUTE
	     "\u00EA":["\\^{e}", "e"], // LATIN SMALL LETTER E WITH CIRCUMFLEX
	     "\u00EB":["\\\"{e}", "e"], // LATIN SMALL LETTER E WITH DIAERESIS
	     "\u00EC":["\\`{i}", "i"], // LATIN SMALL LETTER I WITH GRAVE
	     "\u00ED":["\\'{i}", "i"], // LATIN SMALL LETTER I WITH ACUTE
	     "\u00EE":["\\^{i}", "i"], // LATIN SMALL LETTER I WITH CIRCUMFLEX
	     "\u00EF":["\\\"{i}", "i"], // LATIN SMALL LETTER I WITH DIAERESIS
	     "\u00F1":["\\~{n}", "n"], // LATIN SMALL LETTER N WITH TILDE
	     "\u00F2":["\\`{o}", "o"], // LATIN SMALL LETTER O WITH GRAVE
	     "\u00F3":["\\'{o}", "o"], // LATIN SMALL LETTER O WITH ACUTE
	     "\u00F4":["\\^{o}", "o"], // LATIN SMALL LETTER O WITH CIRCUMFLEX
	     "\u00F5":["\\~{o}", "o"], // LATIN SMALL LETTER O WITH TILDE
	     "\u00F6":["\\\"{o}", "o"], // LATIN SMALL LETTER O WITH DIAERESIS
	     "\u00F9":["\\`{u}", "u"], // LATIN SMALL LETTER U WITH GRAVE
	     "\u00FA":["\\'{u}", "u"], // LATIN SMALL LETTER U WITH ACUTE
	     "\u00FB":["\\^{u}", "u"], // LATIN SMALL LETTER U WITH CIRCUMFLEX
	     "\u00FC":["\\\"{u}", "u"], // LATIN SMALL LETTER U WITH DIAERESIS
	     "\u00FD":["\\'{y}", "y"], // LATIN SMALL LETTER Y WITH ACUTE
	     "\u00FF":["\\\"{y}", "y"], // LATIN SMALL LETTER Y WITH DIAERESIS
	     "\u0100":["\\={A}", "A"], // LATIN CAPITAL LETTER A WITH MACRON
	     "\u0101":["\\={a}", "a"], // LATIN SMALL LETTER A WITH MACRON
	     "\u0102":["\\u{A}", "A"], // LATIN CAPITAL LETTER A WITH BREVE
	     "\u0103":["\\u{a}", "a"], // LATIN SMALL LETTER A WITH BREVE
	     "\u0104":["\\k{A}", "A"], // LATIN CAPITAL LETTER A WITH OGONEK
	     "\u0105":["\\k{a}", "a"], // LATIN SMALL LETTER A WITH OGONEK
	     "\u0106":["\\'{C}", "C"], // LATIN CAPITAL LETTER C WITH ACUTE
	     "\u0107":["\\'{c}", "c"], // LATIN SMALL LETTER C WITH ACUTE
	     "\u0108":["\\^{C}", "C"], // LATIN CAPITAL LETTER C WITH CIRCUMFLEX
	     "\u0109":["\\^{c}", "c"], // LATIN SMALL LETTER C WITH CIRCUMFLEX
   	     "\u010A":["\\.{C}", "C"], // LATIN CAPITAL LETTER C WITH DOT ABOVE
	     "\u010B":["\\.{c}", "c"], // LATIN SMALL LETTER C WITH DOT ABOVE
	     "\u010C":["\\v{C}", "C"], // LATIN CAPITAL LETTER C WITH CARON
	     "\u010D":["\\v{c}", "c"], // LATIN SMALL LETTER C WITH CARON
	     "\u010E":["\\v{D}", "D"], // LATIN CAPITAL LETTER D WITH CARON
	     "\u010F":["\\v{d}", "d"], // LATIN SMALL LETTER D WITH CARON
	     "\u0112":["\\={E}", "E"], // LATIN CAPITAL LETTER E WITH MACRON
	     "\u0113":["\\={e}", "e"], // LATIN SMALL LETTER E WITH MACRON
	     "\u0114":["\\u{E}", "E"], // LATIN CAPITAL LETTER E WITH BREVE
	     "\u0115":["\\u{e}", "e"], // LATIN SMALL LETTER E WITH BREVE
	     "\u0116":["\\.{E}", "E"], // LATIN CAPITAL LETTER E WITH DOT ABOVE
	     "\u0117":["\\.{e}", "e"], // LATIN SMALL LETTER E WITH DOT ABOVE
	     "\u0118":["\\k{E}", "E"], // LATIN CAPITAL LETTER E WITH OGONEK
	     "\u0119":["\\k{e}", "e"], // LATIN SMALL LETTER E WITH OGONEK
	     "\u011A":["\\v{E}", "E"], // LATIN CAPITAL LETTER E WITH CARON
	     "\u011B":["\\v{e}", "e"], // LATIN SMALL LETTER E WITH CARON
	     "\u011C":["\\^{G}", "G"], // LATIN CAPITAL LETTER G WITH CIRCUMFLEX
	     "\u011D":["\\^{g}", "g"], // LATIN SMALL LETTER G WITH CIRCUMFLEX
	     "\u011E":["\\u{G}", "G"], // LATIN CAPITAL LETTER G WITH BREVE
	     "\u011F":["\\u{g}", "g"], // LATIN SMALL LETTER G WITH BREVE
	     "\u0120":["\\.{G}", "G"], // LATIN CAPITAL LETTER G WITH DOT ABOVE
	     "\u0121":["\\.{g}", "g"], // LATIN SMALL LETTER G WITH DOT ABOVE
	     "\u0122":["\\c{G}", "G"], // LATIN CAPITAL LETTER G WITH CEDILLA
	     "\u0123":["\\c{g}", "g"], // LATIN SMALL LETTER G WITH CEDILLA
	     "\u0124":["\\^{H}", "H"], // LATIN CAPITAL LETTER H WITH CIRCUMFLEX
	     "\u0125":["\\^{h}", "h"], // LATIN SMALL LETTER H WITH CIRCUMFLEX
      	 "\u0128":["\\~{I}", "I"], // LATIN CAPITAL LETTER I WITH TILDE
	     "\u0129":["\\~{i}", "i"], // LATIN SMALL LETTER I WITH TILDE
	     "\u012A":["\\={I}", "I"], // LATIN CAPITAL LETTER I WITH MACRON
	     "\u012B":["\\={\\i}", "i"], // LATIN SMALL LETTER I WITH MACRON
	     "\u012C":["\\u{I}", "I"], // LATIN CAPITAL LETTER I WITH BREVE
	     "\u012D":["\\u{i}", "i"], // LATIN SMALL LETTER I WITH BREVE
	     "\u012E":["\\k{I}", "I"], // LATIN CAPITAL LETTER I WITH OGONEK
	     "\u012F":["\\k{i}", "i"], // LATIN SMALL LETTER I WITH OGONEK
	     "\u0130":["\\.{I}", "I"], // LATIN CAPITAL LETTER I WITH DOT ABOVE
	     "\u0134":["\\^{J}", "J"], // LATIN CAPITAL LETTER J WITH CIRCUMFLEX
	     "\u0135":["\\^{j}", "j"], // LATIN SMALL LETTER J WITH CIRCUMFLEX
	     "\u0136":["\\c{K}", "K"], // LATIN CAPITAL LETTER K WITH CEDILLA
	     "\u0137":["\\c{k}", "k"], // LATIN SMALL LETTER K WITH CEDILLA
	     "\u0139":["\\'{L}", "L"], // LATIN CAPITAL LETTER L WITH ACUTE
	     "\u013A":["\\'{l}", "l"], // LATIN SMALL LETTER L WITH ACUTE
	     "\u013B":["\\c{L}", "L"], // LATIN CAPITAL LETTER L WITH CEDILLA
	     "\u013C":["\\c{l}", "l"], // LATIN SMALL LETTER L WITH CEDILLA
	     "\u013D":["\\v{L}", "L"], // LATIN CAPITAL LETTER L WITH CARON
	     "\u013E":["\\v{l}", "l"], // LATIN SMALL LETTER L WITH CARON
	     "\u0141":["\\L{}", "L"], //LATIN CAPITAL LETTER L WITH STROKE
	     "\u0142":["\\l{}", "l"], //LATIN SMALL LETTER L WITH STROKE
	     "\u0143":["\\'{N}", "N"], // LATIN CAPITAL LETTER N WITH ACUTE
	     "\u0144":["\\'{n}", "n"], // LATIN SMALL LETTER N WITH ACUTE
	     "\u0145":["\\c{N}", "N"], // LATIN CAPITAL LETTER N WITH CEDILLA
	     "\u0146":["\\c{n}", "n"], // LATIN SMALL LETTER N WITH CEDILLA
	     "\u0147":["\\v{N}", "N"], // LATIN CAPITAL LETTER N WITH CARON
 	     "\u0148":["\\v{n}", "n"], // LATIN SMALL LETTER N WITH CARON
	     "\u014C":["\\={O}", "O"], // LATIN CAPITAL LETTER O WITH MACRON
	     "\u014D":["\\={o}", "o"], // LATIN SMALL LETTER O WITH MACRON
	     "\u014E":["\\u{O}", "O"], // LATIN CAPITAL LETTER O WITH BREVE
	     "\u014F":["\\u{o}", "o"], // LATIN SMALL LETTER O WITH BREVE
	     "\u0150":["\\H{O}", "O"], // LATIN CAPITAL LETTER O WITH DOUBLE ACUTE
	     "\u0151":["\\H{o}", "o"], // LATIN SMALL LETTER O WITH DOUBLE ACUTE
  	     "\u0154":["\\'{R}", "R"], // LATIN CAPITAL LETTER R WITH ACUTE
	     "\u0155":["\\'{r}", "r"], // LATIN SMALL LETTER R WITH ACUTE
	     "\u0156":["\\c{R}", "R"], // LATIN CAPITAL LETTER R WITH CEDILLA
	     "\u0157":["\\c{r}", "r"], // LATIN SMALL LETTER R WITH CEDILLA
	     "\u0158":["\\v{R}", "R"], // LATIN CAPITAL LETTER R WITH CARON
	     "\u0159":["\\v{r}", "r"], // LATIN SMALL LETTER R WITH CARON
	     "\u015A":["\\'{S}", "S"], // LATIN CAPITAL LETTER S WITH ACUTE
	     "\u015B":["\\'{s}", "s"], // LATIN SMALL LETTER S WITH ACUTE
	     "\u015C":["\\^{S}", "S"], // LATIN CAPITAL LETTER S WITH CIRCUMFLEX
	     "\u015D":["\\^{s}", "s"], // LATIN SMALL LETTER S WITH CIRCUMFLEX
	     "\u015E":["\\c{S}", "S"], // LATIN CAPITAL LETTER S WITH CEDILLA
	     "\u015F":["\\c{s}", "s"], // LATIN SMALL LETTER S WITH CEDILLA
	     "\u0160":["\\v{S}", "S"], // LATIN CAPITAL LETTER S WITH CARON
	     "\u0161":["\\v{s}", "s"], // LATIN SMALL LETTER S WITH CARON
	     "\u0162":["\\c{T}", "T"], // LATIN CAPITAL LETTER T WITH CEDILLA
	     "\u0163":["\\c{t}", "t"], // LATIN SMALL LETTER T WITH CEDILLA
	     "\u0164":["\\v{T}", "T"], // LATIN CAPITAL LETTER T WITH CARON
	     "\u0165":["\\v{t}", "t"], // LATIN SMALL LETTER T WITH CARON
	     "\u0168":["\\~{U}", "U"], // LATIN CAPITAL LETTER U WITH TILDE
 	     "\u0169":["\\~{u}", "u"], // LATIN SMALL LETTER U WITH TILDE
	     "\u016A":["\\={U}", "U"], // LATIN CAPITAL LETTER U WITH MACRON
	     "\u016B":["\\={u}", "u"], // LATIN SMALL LETTER U WITH MACRON
	     "\u016C":["\\u{U}", "U"], // LATIN CAPITAL LETTER U WITH BREVE
	     "\u016D":["\\u{u}", "u"], // LATIN SMALL LETTER U WITH BREVE
	     "\u0170":["\\H{U}", "U"], // LATIN CAPITAL LETTER U WITH DOUBLE ACUTE
	     "\u0171":["\\H{u}", "u"], // LATIN SMALL LETTER U WITH DOUBLE ACUTE
	     "\u0172":["\\k{U}", "U"], // LATIN CAPITAL LETTER U WITH OGONEK
	     "\u0173":["\\k{u}", "u"], // LATIN SMALL LETTER U WITH OGONEK
	     "\u0174":["\\^{W}", "W"], // LATIN CAPITAL LETTER W WITH CIRCUMFLEX
	     "\u0175":["\\^{w}", "w"], // LATIN SMALL LETTER W WITH CIRCUMFLEX
	     "\u0176":["\\^{Y}", "Y"], // LATIN CAPITAL LETTER Y WITH CIRCUMFLEX
	     "\u0177":["\\^{y}", "y"], // LATIN SMALL LETTER Y WITH CIRCUMFLEX
	     "\u0178":["\\\"{Y}", "Y"], // LATIN CAPITAL LETTER Y WITH DIAERESIS
	     "\u0179":["\\'{Z}", "Z"], // LATIN CAPITAL LETTER Z WITH ACUTE
	     "\u017A":["\\'{z}", "z"], // LATIN SMALL LETTER Z WITH ACUTE
	     "\u017B":["\\.{Z}", "Z"], // LATIN CAPITAL LETTER Z WITH DOT ABOVE
	     "\u017C":["\\.{z}", "z"], // LATIN SMALL LETTER Z WITH DOT ABOVE
	     "\u017D":["\\v{Z}", "Z"], // LATIN CAPITAL LETTER Z WITH CARON
	     "\u017E":["\\v{z}", "z"], // LATIN SMALL LETTER Z WITH CARON
	     "\u01CD":["\\v{A}", "A"], // LATIN CAPITAL LETTER A WITH CARON
	     "\u01CE":["\\v{a}", "a"], // LATIN SMALL LETTER A WITH CARON
	     "\u01CF":["\\v{I}", "I"], // LATIN CAPITAL LETTER I WITH CARON
	     "\u01D0":["\\v{i}", "i"], // LATIN SMALL LETTER I WITH CARON
	     "\u01D1":["\\v{O}", "O"], // LATIN CAPITAL LETTER O WITH CARON
	     "\u01D2":["\\v{o}", "o"], // LATIN SMALL LETTER O WITH CARON
	     "\u01D3":["\\v{U}", "U"], // LATIN CAPITAL LETTER U WITH CARON
	     "\u01D4":["\\v{u}", "u"], // LATIN SMALL LETTER U WITH CARON
	     "\u01E6":["\\v{G}", "G"], // LATIN CAPITAL LETTER G WITH CARON
	     "\u01E7":["\\v{g}", "g"], // LATIN SMALL LETTER G WITH CARON
	     "\u01E8":["\\v{K}", "K"], // LATIN CAPITAL LETTER K WITH CARON
	     "\u01E9":["\\v{k}", "k"], // LATIN SMALL LETTER K WITH CARON
	     "\u01EA":["\\k{O}", "O"], // LATIN CAPITAL LETTER O WITH OGONEK
	     "\u01EB":["\\k{o}", "o"], // LATIN SMALL LETTER O WITH OGONEK
	     "\u01F0":["\\v{j}", "j"], // LATIN SMALL LETTER J WITH CARON
	     "\u01F4":["\\'{G}", "G"], // LATIN CAPITAL LETTER G WITH ACUTE
	     "\u01F5":["\\'{g}", "g"], // LATIN SMALL LETTER G WITH ACUTE
	     "\u1E02":["\\.{B}", "B"], // LATIN CAPITAL LETTER B WITH DOT ABOVE
   	     "\u1E03":["\\.{b}", "b"], // LATIN SMALL LETTER B WITH DOT ABOVE
	     "\u1E04":["\\d{B}", "B"], // LATIN CAPITAL LETTER B WITH DOT BELOW
	     "\u1E05":["\\d{b}", "b"], // LATIN SMALL LETTER B WITH DOT BELOW
	     "\u1E06":["\\b{B}", "B"], // LATIN CAPITAL LETTER B WITH LINE BELOW
	     "\u1E07":["\\b{b}", "b"], // LATIN SMALL LETTER B WITH LINE BELOW
	     "\u1E0A":["\\.{D}", "D"], // LATIN CAPITAL LETTER D WITH DOT ABOVE
	     "\u1E0B":["\\.{d}", "d"], // LATIN SMALL LETTER D WITH DOT ABOVE
	     "\u1E0C":["\\d{D}", "D"], // LATIN CAPITAL LETTER D WITH DOT BELOW
	     "\u1E0D":["\\d{d}", "d"], // LATIN SMALL LETTER D WITH DOT BELOW
	     "\u1E0E":["\\b{D}", "D"], // LATIN CAPITAL LETTER D WITH LINE BELOW
	     "\u1E0F":["\\b{d}", "d"], // LATIN SMALL LETTER D WITH LINE BELOW
	     "\u1E10":["\\c{D}", "D"], // LATIN CAPITAL LETTER D WITH CEDILLA
	     "\u1E11":["\\c{d}", "d"], // LATIN SMALL LETTER D WITH CEDILLA
	     "\u1E1E":["\\.{F}", "F"], // LATIN CAPITAL LETTER F WITH DOT ABOVE
	     "\u1E1F":["\\.{f}", "f"], // LATIN SMALL LETTER F WITH DOT ABOVE
	     "\u1E20":["\\={G}", "G"], // LATIN CAPITAL LETTER G WITH MACRON
	     "\u1E21":["\\={g}", "g"], // LATIN SMALL LETTER G WITH MACRON
	     "\u1E22":["\\.{H}", "H"], // LATIN CAPITAL LETTER H WITH DOT ABOVE
	     "\u1E23":["\\.{h}", "h"], // LATIN SMALL LETTER H WITH DOT ABOVE
	     "\u1E24":["\\d{H}", "H"], // LATIN CAPITAL LETTER H WITH DOT BELOW
	     "\u1E25":["\\d{h}", "h"], // LATIN SMALL LETTER H WITH DOT BELOW
	     "\u1E26":["\\\"{H}", "H"], // LATIN CAPITAL LETTER H WITH DIAERESIS
	     "\u1E27":["\\\"{h}", "h"], // LATIN SMALL LETTER H WITH DIAERESIS
	     "\u1E28":["\\c{H}", "H"], // LATIN CAPITAL LETTER H WITH CEDILLA
	     "\u1E29":["\\c{h}", "h"], // LATIN SMALL LETTER H WITH CEDILLA
	     "\u1E30":["\\'{K}", "K"], // LATIN CAPITAL LETTER K WITH ACUTE
	     "\u1E31":["\\'{k}", "k"], // LATIN SMALL LETTER K WITH ACUTE
	     "\u1E32":["\\d{K}", "K"], // LATIN CAPITAL LETTER K WITH DOT BELOW
	     "\u1E33":["\\d{k}", "k"], // LATIN SMALL LETTER K WITH DOT BELOW
	     "\u1E34":["\\b{K}", "K"], // LATIN CAPITAL LETTER K WITH LINE BELOW
	     "\u1E35":["\\b{k}", "k"], // LATIN SMALL LETTER K WITH LINE BELOW
	     "\u1E36":["\\d{L}", "L"], // LATIN CAPITAL LETTER L WITH DOT BELOW
	     "\u1E37":["\\d{l}", "l"], // LATIN SMALL LETTER L WITH DOT BELOW
	     "\u1E3A":["\\b{L}", "L"], // LATIN CAPITAL LETTER L WITH LINE BELOW
	     "\u1E3B":["\\b{l}", "l"], // LATIN SMALL LETTER L WITH LINE BELOW
	     "\u1E3E":["\\'{M}", "M"], // LATIN CAPITAL LETTER M WITH ACUTE
	     "\u1E3F":["\\'{m}", "m"], // LATIN SMALL LETTER M WITH ACUTE
	     "\u1E40":["\\.{M}", "M"], // LATIN CAPITAL LETTER M WITH DOT ABOVE
	     "\u1E41":["\\.{m}", "m"], // LATIN SMALL LETTER M WITH DOT ABOVE
	     "\u1E42":["\\d{M}", "M"], // LATIN CAPITAL LETTER M WITH DOT BELOW
	     "\u1E43":["\\d{m}", "m"], // LATIN SMALL LETTER M WITH DOT BELOW
	     "\u1E44":["\\.{N}", "N"], // LATIN CAPITAL LETTER N WITH DOT ABOVE
     	 "\u1E45":["\\.{n}", "n"], // LATIN SMALL LETTER N WITH DOT ABOVE
       	 "\u1E46":["\\d{N}", "N"], // LATIN CAPITAL LETTER N WITH DOT BELOW
     	 "\u1E47":["\\d{n}", "n"], // LATIN SMALL LETTER N WITH DOT BELOW
     	 "\u1E48":["\\b{N}", "N"], // LATIN CAPITAL LETTER N WITH LINE BELOW
     	 "\u1E49":["\\b{n}", "n"], // LATIN SMALL LETTER N WITH LINE BELOW
     	 "\u1E54":["\\'{P}", "P"], // LATIN CAPITAL LETTER P WITH ACUTE
     	 "\u1E55":["\\'{p}", "p"], // LATIN SMALL LETTER P WITH ACUTE
     	 "\u1E56":["\\.{P}", "P"], // LATIN CAPITAL LETTER P WITH DOT ABOVE
     	 "\u1E57":["\\.{p}", "p"], // LATIN SMALL LETTER P WITH DOT ABOVE
     	 "\u1E58":["\\.{R}", "R"], // LATIN CAPITAL LETTER R WITH DOT ABOVE
     	 "\u1E59":["\\.{r}", "r"], // LATIN SMALL LETTER R WITH DOT ABOVE
     	 "\u1E5A":["\\d{R}", "R"], // LATIN CAPITAL LETTER R WITH DOT BELOW
     	 "\u1E5B":["\\d{r}", "r"], // LATIN SMALL LETTER R WITH DOT BELOW
	     "\u1E5E":["\\b{R}", "R"], // LATIN CAPITAL LETTER R WITH LINE BELOW
	     "\u1E5F":["\\b{r}", "r"], // LATIN SMALL LETTER R WITH LINE BELOW
	     "\u1E60":["\\.{S}", "S"], // LATIN CAPITAL LETTER S WITH DOT ABOVE
	     "\u1E61":["\\.{s}", "s"], // LATIN SMALL LETTER S WITH DOT ABOVE
	     "\u1E62":["\\d{S}", "S"], // LATIN CAPITAL LETTER S WITH DOT BELOW
	     "\u1E63":["\\d{s}", "s"], // LATIN SMALL LETTER S WITH DOT BELOW
	     "\u1E6A":["\\.{T}", "T"], // LATIN CAPITAL LETTER T WITH DOT ABOVE
	     "\u1E6B":["\\.{t}", "t"], // LATIN SMALL LETTER T WITH DOT ABOVE
	     "\u1E6C":["\\d{T}", "T"], // LATIN CAPITAL LETTER T WITH DOT BELOW
	     "\u1E6D":["\\d{t}", "t"], // LATIN SMALL LETTER T WITH DOT BELOW
	     "\u1E6E":["\\b{T}", "T"], // LATIN CAPITAL LETTER T WITH LINE BELOW
	     "\u1E6F":["\\b{t}", "t"], // LATIN SMALL LETTER T WITH LINE BELOW
	     "\u1E7C":["\\~{V}", "V"], // LATIN CAPITAL LETTER V WITH TILDE
	     "\u1E7D":["\\~{v}", "v"], // LATIN SMALL LETTER V WITH TILDE
	     "\u1E7E":["\\d{V}", "V"], // LATIN CAPITAL LETTER V WITH DOT BELOW
	     "\u1E7F":["\\d{v}", "v"], // LATIN SMALL LETTER V WITH DOT BELOW
	     "\u1E80":["\\`{W}", "W"], // LATIN CAPITAL LETTER W WITH GRAVE
	     "\u1E81":["\\`{w}", "w"], // LATIN SMALL LETTER W WITH GRAVE
	     "\u1E82":["\\'{W}", "W"], // LATIN CAPITAL LETTER W WITH ACUTE
	     "\u1E83":["\\'{w}", "w"], // LATIN SMALL LETTER W WITH ACUTE
	     "\u1E84":["\\\"{W}", "W"], // LATIN CAPITAL LETTER W WITH DIAERESIS
	     "\u1E85":["\\\"{w}", "w"], // LATIN SMALL LETTER W WITH DIAERESIS
	     "\u1E86":["\\.{W}", "W"], // LATIN CAPITAL LETTER W WITH DOT ABOVE
	     "\u1E87":["\\.{w}", "w"], // LATIN SMALL LETTER W WITH DOT ABOVE
	     "\u1E88":["\\d{W}", "W"], // LATIN CAPITAL LETTER W WITH DOT BELOW
	     "\u1E89":["\\d{w}", "w"], // LATIN SMALL LETTER W WITH DOT BELOW
	     "\u1E8A":["\\.{X}", "X"], // LATIN CAPITAL LETTER X WITH DOT ABOVE
	     "\u1E8B":["\\.{x}", "x"], // LATIN SMALL LETTER X WITH DOT ABOVE
	     "\u1E8C":["\\\"{X}", "X"], // LATIN CAPITAL LETTER X WITH DIAERESIS
	     "\u1E8D":["\\\"{x}", "x"], // LATIN SMALL LETTER X WITH DIAERESIS
	     "\u1E8E":["\\.{Y}", "Y"], // LATIN CAPITAL LETTER Y WITH DOT ABOVE
	     "\u1E8F":["\\.{y}", "y"], // LATIN SMALL LETTER Y WITH DOT ABOVE
	     "\u1E90":["\\^{Z}", "Z"], // LATIN CAPITAL LETTER Z WITH CIRCUMFLEX
	     "\u1E91":["\\^{z}", "z"], // LATIN SMALL LETTER Z WITH CIRCUMFLEX
	     "\u1E92":["\\d{Z}", "Z"], // LATIN CAPITAL LETTER Z WITH DOT BELOW
	     "\u1E93":["\\d{z}", "z"], // LATIN SMALL LETTER Z WITH DOT BELOW
	     "\u1E94":["\\b{Z}", "Z"], // LATIN CAPITAL LETTER Z WITH LINE BELOW
	     "\u1E95":["\\b{z}", "z"], // LATIN SMALL LETTER Z WITH LINE BELOW
	     "\u1E96":["\\b{h}", "h"], // LATIN SMALL LETTER H WITH LINE BELOW
	     "\u1E97":["\\\"{t}", "t"], // LATIN SMALL LETTER T WITH DIAERESIS
	     "\u1EA0":["\\d{A}", "A"], // LATIN CAPITAL LETTER A WITH DOT BELOW
	     "\u1EA1":["\\d{a}", "a"], // LATIN SMALL LETTER A WITH DOT BELOW
	     "\u1EB8":["\\d{E}", "E"], // LATIN CAPITAL LETTER E WITH DOT BELOW
	     "\u1EB9":["\\d{e}", "e"], // LATIN SMALL LETTER E WITH DOT BELOW
	     "\u1EBC":["\\~{E}", "E"], // LATIN CAPITAL LETTER E WITH TILDE
	     "\u1EBD":["\\~{e}", "e"], // LATIN SMALL LETTER E WITH TILDE
	     "\u1ECA":["\\d{I}", "I"], // LATIN CAPITAL LETTER I WITH DOT BELOW
	     "\u1ECB":["\\d{i}", "i"], // LATIN SMALL LETTER I WITH DOT BELOW
	     "\u1ECC":["\\d{O}", "O"], // LATIN CAPITAL LETTER O WITH DOT BELOW
	     "\u1ECD":["\\d{o}", "o"], // LATIN SMALL LETTER O WITH DOT BELOW
	     "\u1EE4":["\\d{U}", "U"], // LATIN CAPITAL LETTER U WITH DOT BELOW
	     "\u1EE5":["\\d{u}", "u"], // LATIN SMALL LETTER U WITH DOT BELOW
	     "\u1EF2":["\\`{Y}", "Y"], // LATIN CAPITAL LETTER Y WITH GRAVE
	     "\u1EF3":["\\`{y}", "y"], // LATIN SMALL LETTER Y WITH GRAVE
	     "\u1EF4":["\\d{Y}", "Y"], // LATIN CAPITAL LETTER Y WITH DOT BELOW
	     "\u1EF5":["\\d{y}", "y"], // LATIN SMALL LETTER Y WITH DOT BELOW
	     "\u1EF8":["\\~{Y}", "Y"], // LATIN CAPITAL LETTER Y WITH TILDE
	     "\u1EF9":["\\~{y}", "y"], // LATIN SMALL LETTER Y WITH TILDE
// original XML at http://www.w3.org/Math/characters/unicode.xml
// XSL for conversion: https://gist.github.com/798546 python code
         "\u0020":["\\space ", " "],
         "\u0023":["\\#", ""],
         "\u0024":["\\textdollar ", ""],
         "\u0025":["\\%", ""],
         "\u0026":["\\&amp;", " "],
         "\u0027":["\\textquotesingle ", ""],
         "\u002A":["\\ast ", ""],
         "\u005C":["\\textbackslash ", " "],
         "\u005E":["\\^{}", ""],
         "\u005F":["\\_", " "],
         "\u0060":["\\textasciigrave ", ""],
         "\u007B":["\\lbrace ", " "],
         "\u007C":["\\vert ", " "],
         "\u007D":["\\rbrace ", " "],
         "\u007E":["\\textasciitilde ", " "],
         "\u00A2":["\\textcent ", ""],
         "\u00A3":["\\textsterling ", ""],
         "\u00A4":["\\textcurrency ", ""],
         "\u00A5":["\\textyen ", ""],
         "\u00A6":["\\textbrokenbar ", ""],
         "\u00A7":["\\textsection ", ""],
         "\u00A8":["\\textasciidieresis ", ""],
         "\u00A9":["\\textcopyright ", ""],
         "\u00AA":["\\textordfeminine ", ""],
         "\u00AB":["\\guillemotleft ", ""],
         "\u00AC":["\\lnot ", " "], // works here
         "\u00AD":["\\-", " "],
         "\u00AE":["\\textregistered ", ""],
         "\u00B6":["\\textparagraph ", " "],
         "\u00BA":["\\textordmasculine ", ""],
         "\u00BB":["\\guillemotright ", ""],
         "\u0110":["\\DJ ", "DJ"],
         "\u0111":["\\dj ", "dj"],
         "\u0126":["{\\fontencoding{LELA}\\selectfont\\char40}", ""],
         "\u0127":["\\Elzxh ", ""],
         "\u013F":["{\\fontencoding{LELA}\\selectfont\\char201}", ""],
         "\u0140":["{\\fontencoding{LELA}\\selectfont\\char202}", ""],
         "\u0166":["{\\fontencoding{LELA}\\selectfont\\char47}", ""],
         "\u0167":["{\\fontencoding{LELA}\\selectfont\\char63}", ""],
         "\u016E":["\\r{U}", "U"],
         "\u016F":["\\r{u}", "u"],
         "\u0195":["\\texthvlig ", ""],
         "\u019E":["\\textnrleg ", ""],
         "\u01AA":["\\eth ", ""],
         "\u01BA":["{\\fontencoding{LELA}\\selectfont\\char195}", ""],
         "\u01C2":["\\textdoublepipe ", ""],
         "\u0250":["\\Elztrna ", ""],
         "\u0252":["\\Elztrnsa ", ""],
         "\u0254":["\\Elzopeno ", ""],
         "\u0256":["\\Elzrtld ", ""],
         "\u0258":["{\\fontencoding{LEIP}\\selectfont\\char61}", ""],
         "\u0259":["\\Elzschwa ", ""],
         "\u025B":["\\varepsilon ", ""],
         "\u0263":["\\Elzpgamma ", ""],
         "\u0264":["\\Elzpbgam ", ""],
         "\u0265":["\\Elztrnh ", ""],
         "\u026C":["\\Elzbtdl ", ""],
         "\u026D":["\\Elzrtll ", ""],
         "\u026F":["\\Elztrnm ", ""],
         "\u0270":["\\Elztrnmlr ", ""],
         "\u0271":["\\Elzltlmr ", ""],
         "\u0272":["\\Elzltln ", ""],
         "\u0273":["\\Elzrtln ", ""],
         "\u0277":["\\Elzclomeg ", ""],
         "\u0278":["\\textphi ", ""],
         "\u0279":["\\Elztrnr ", ""],
         "\u027A":["\\Elztrnrl ", ""],
         "\u027B":["\\Elzrttrnr ", ""],
         "\u027C":["\\Elzrl ", ""],
         "\u027D":["\\Elzrtlr ", ""],
         "\u027E":["\\Elzfhr ", ""],
         "\u027F":["{\\fontencoding{LEIP}\\selectfont\\char202}", ""],
         "\u0282":["\\Elzrtls ", ""],
         "\u0283":["\\Elzesh ", ""],
         "\u0287":["\\Elztrnt ", ""],
         "\u0288":["\\Elzrtlt ", ""],
         "\u028A":["\\Elzpupsil ", ""],
         "\u028B":["\\Elzpscrv ", ""],
         "\u028C":["\\Elzinvv ", ""],
         "\u028D":["\\Elzinvw ", ""],
         "\u028E":["\\Elztrny ", ""],
         "\u0290":["\\Elzrtlz ", ""],
         "\u0292":["\\Elzyogh ", ""],
         "\u0294":["\\Elzglst ", ""],
         "\u0295":["\\Elzreglst ", ""],
         "\u0296":["\\Elzinglst ", ""],
         "\u029E":["\\textturnk ", ""],
         "\u02A4":["\\Elzdyogh ", ""],
         "\u02A7":["\\Elztesh ", ""],
         "\u02C7":["\\textasciicaron ", ""],
         "\u02D1":["\\Elzhlmrk ", ""],
         "\u02D2":["\\Elzsbrhr ", ""],
         "\u02D3":["\\Elzsblhr ", ""],
         "\u02D4":["\\Elzrais ", ""],
         "\u02D5":["\\Elzlow ", ""],
         "\u02D8":["\\textasciibreve ", ""],
         "\u02D9":["\\textperiodcentered ", ""],
         "\u02DB":["\\k{}", ""],
         "\u02E5":["\\tone{55}", ""],
         "\u02E6":["\\tone{44}", ""],
         "\u02E7":["\\tone{33}", ""],
         "\u02E8":["\\tone{22}", ""],
         "\u02E9":["\\tone{11}", ""],
         "\u0300":["\\`", ""],
         "\u0301":["\\'", ""],
         "\u0302":["\\^", ""],
         "\u0303":["\\~", ""],
         "\u0304":["\\=", ""],
         "\u0306":["\\u", ""],
         "\u0307":["\\.", ""],
         "\u0308":["\\\"", ""],
         "\u030A":["\\r", ""],
         "\u030B":["\\H", ""],
         "\u030C":["\\v", ""],
         "\u030F":["\\cyrchar\\C", ""],
         "\u0311":["{\\fontencoding{LECO}\\selectfont\\char177}", ""],
         "\u0318":["{\\fontencoding{LECO}\\selectfont\\char184}", ""],
         "\u0319":["{\\fontencoding{LECO}\\selectfont\\char185}", ""],
         "\u0321":["\\Elzpalh ", ""],
         "\u0322":["\\Elzrh ", ""],
         "\u0327":["\\c", ""],
         "\u0328":["\\k", ""],
         "\u032A":["\\Elzsbbrg ", ""],
         "\u032B":["{\\fontencoding{LECO}\\selectfont\\char203}", ""],
         "\u032F":["{\\fontencoding{LECO}\\selectfont\\char207}", ""],
         "\u0335":["\\Elzxl ", ""],
         "\u0336":["\\Elzbar ", ""],
         "\u0337":["{\\fontencoding{LECO}\\selectfont\\char215}", ""],
         "\u0338":["{\\fontencoding{LECO}\\selectfont\\char216}", ""],
         "\u033A":["{\\fontencoding{LECO}\\selectfont\\char218}", ""],
         "\u033B":["{\\fontencoding{LECO}\\selectfont\\char219}", ""],
         "\u033C":["{\\fontencoding{LECO}\\selectfont\\char220}", ""],
         "\u033D":["{\\fontencoding{LECO}\\selectfont\\char221}", ""],
         "\u0361":["{\\fontencoding{LECO}\\selectfont\\char225}", ""],
         "\u0386":["\\'{A}", "A"],
         "\u0388":["\\'{E}", "E"],
         "\u0389":["\\'{H}", "H"],
         "\u038A":["\\'{}{I}", "I"],
         "\u038C":["\\'{}O", "O"],
         "\u038E":["\\mathrm{'Y}", "Y"],
         "\u038F":["\\mathrm{'\\Omega}", "Omega"],
         "\u0390":["\\acute{\\ddot{\\iota}}", "iota"],
         "\u0391":["\\Alpha ", "Alpha"],
         "\u0392":["\\Beta ", "Beta"],
         "\u0393":["\\Gamma ", "Gamma"],
         "\u0394":["\\Delta ", "Delta"],
         "\u0395":["\\Epsilon ", "Epsilon"],
         "\u0396":["\\Zeta ", "Zeta"],
         "\u0397":["\\Eta ", "Eta"],
         "\u0398":["\\Theta ", "Theta"],
         "\u0399":["\\Iota ", "Iota"],
         "\u039A":["\\Kappa ", "Kappa"],
         "\u039B":["\\Lambda ", "Lambda"],
         "\u039E":["\\Xi ", "Xi"],
         "\u03A0":["\\Pi ", "Pi"],
         "\u03A1":["\\Rho ", "Rho"],
         "\u03A3":["\\Sigma ", "Sigma"],
         "\u03A4":["\\Tau ", "Tau"],
         "\u03A5":["\\Upsilon ", "Upsilon"],
         "\u03A6":["\\Phi ", "Phi"],
         "\u03A7":["\\Chi ", "Chi"],
         "\u03A8":["\\Psi ", "Psi"],
         "\u03A9":["\\Omega ", "Omega"],
         "\u03AA":["\\mathrm{\\ddot{I}}", "I"],
         "\u03AB":["\\mathrm{\\ddot{Y}}", "Y"],
         "\u03AC":["\\'{$\\alpha$}", "alpha"],
         "\u03AD":["\\acute{\\epsilon}", "epsilon"],
         "\u03AE":["\\acute{\\eta}", "eta"],
         "\u03AF":["\\acute{\\iota}", "iota"],
         "\u03B0":["\\acute{\\ddot{\\upsilon}}", "upsilon"],
         "\u03B1":["\\alpha ", "alpha"],
         "\u03B2":["\\beta ", "beta"],
         "\u03B3":["\\gamma ", "gamma"],
         "\u03B4":["\\delta ", "delta"],
         "\u03B5":["\\epsilon ", "epsilon"],
         "\u03B6":["\\zeta ", "zeta"],
         "\u03B7":["\\eta ", "eta"],
         "\u03B8":["\\texttheta ", "theta"],
         "\u03B9":["\\iota ", "iota"],
         "\u03BA":["\\kappa ", "kappa"],
         "\u03BB":["\\lambda ", "lambda"],
         "\u03BC":["\\mu ", "mu"],
         "\u03BD":["\\nu ", "nu"],
         "\u03BE":["\\xi ", "xi"],
         "\u03C0":["\\pi ", "pi"],
         "\u03C1":["\\rho ", "rho"],
         "\u03C2":["\\varsigma ", "sigma"],
         "\u03C3":["\\sigma ", "sigma"],
         "\u03C4":["\\tau ", "tau"],
         "\u03C5":["\\upsilon ", "upsilon"],
         "\u03C6":["\\varphi ", "phi"],
         "\u03C7":["\\chi ", "chi"],
         "\u03C8":["\\psi ", "psi"],
         "\u03C9":["\\omega ", "omega"],
         "\u03CA":["\\ddot{\\iota}", "iota"],
         "\u03CB":["\\ddot{\\upsilon}", "upsilon"],
         "\u03CC":["\\'{o}", "o"],
         "\u03CD":["\\acute{\\upsilon}", "upsilon"],
         "\u03CE":["\\acute{\\omega}", "omega"],
         "\u03D0":["\\Pisymbol{ppi022}{87}", "pi"],
         "\u03D1":["\\textvartheta ", "theta"],
         "\u03D2":["\\Upsilon ", "Upsilon"],
         "\u03D5":["\\phi ", "phi"],
         "\u03D6":["\\varpi ", "pi"],
         "\u03DA":["\\Stigma ", ""],
         "\u03DC":["\\Digamma ", ""],
         "\u03DD":["\\digamma ", ""],
         "\u03DE":["\\Koppa ", ""],
         "\u03E0":["\\Sampi ", ""],
         "\u03F0":["\\varkappa ", "kappa"],
         "\u03F1":["\\varrho ", "rho"],
         "\u03F4":["\\textTheta ", "Theta"],
         "\u03F6":["\\backepsilon ", "epsilon"],
         "\u0401":["\\cyrchar\\CYRYO ", ""],
         "\u0402":["\\cyrchar\\CYRDJE ", ""],
         "\u0403":["\\cyrchar{\\'\\CYRG}", ""],
         "\u0404":["\\cyrchar\\CYRIE ", ""],
         "\u0405":["\\cyrchar\\CYRDZE ", ""],
         "\u0406":["\\cyrchar\\CYRII ", ""],
         "\u0407":["\\cyrchar\\CYRYI ", ""],
         "\u0408":["\\cyrchar\\CYRJE ", ""],
         "\u0409":["\\cyrchar\\CYRLJE ", ""],
         "\u040A":["\\cyrchar\\CYRNJE ", ""],
         "\u040B":["\\cyrchar\\CYRTSHE ", ""],
         "\u040C":["\\cyrchar{\\'\\CYRK}", ""],
         "\u040E":["\\cyrchar\\CYRUSHRT ", ""],
         "\u040F":["\\cyrchar\\CYRDZHE ", ""],
         "\u0410":["\\cyrchar\\CYRA ", ""],
         "\u0411":["\\cyrchar\\CYRB ", ""],
         "\u0412":["\\cyrchar\\CYRV ", ""],
         "\u0413":["\\cyrchar\\CYRG ", ""],
         "\u0414":["\\cyrchar\\CYRD ", ""],
         "\u0415":["\\cyrchar\\CYRE ", ""],
         "\u0416":["\\cyrchar\\CYRZH ", ""],
         "\u0417":["\\cyrchar\\CYRZ ", ""],
         "\u0418":["\\cyrchar\\CYRI ", ""],
         "\u0419":["\\cyrchar\\CYRISHRT ", ""],
         "\u041A":["\\cyrchar\\CYRK ", ""],
         "\u041B":["\\cyrchar\\CYRL ", ""],
         "\u041C":["\\cyrchar\\CYRM ", ""],
         "\u041D":["\\cyrchar\\CYRN ", ""],
         "\u041E":["\\cyrchar\\CYRO ", ""],
         "\u041F":["\\cyrchar\\CYRP ", ""],
         "\u0420":["\\cyrchar\\CYRR ", ""],
         "\u0421":["\\cyrchar\\CYRS ", ""],
         "\u0422":["\\cyrchar\\CYRT ", ""],
         "\u0423":["\\cyrchar\\CYRU ", ""],
         "\u0424":["\\cyrchar\\CYRF ", ""],
         "\u0425":["\\cyrchar\\CYRH ", ""],
         "\u0426":["\\cyrchar\\CYRC ", ""],
         "\u0427":["\\cyrchar\\CYRCH ", ""],
         "\u0428":["\\cyrchar\\CYRSH ", ""],
         "\u0429":["\\cyrchar\\CYRSHCH ", ""],
         "\u042A":["\\cyrchar\\CYRHRDSN ", ""],
         "\u042B":["\\cyrchar\\CYRERY ", ""],
         "\u042C":["\\cyrchar\\CYRSFTSN ", ""],
         "\u042D":["\\cyrchar\\CYREREV ", ""],
         "\u042E":["\\cyrchar\\CYRYU ", ""],
         "\u042F":["\\cyrchar\\CYRYA ", ""],
         "\u0430":["\\cyrchar\\cyra ", ""],
         "\u0431":["\\cyrchar\\cyrb ", ""],
         "\u0432":["\\cyrchar\\cyrv ", ""],
         "\u0433":["\\cyrchar\\cyrg ", ""],
         "\u0434":["\\cyrchar\\cyrd ", ""],
         "\u0435":["\\cyrchar\\cyre ", ""],
         "\u0436":["\\cyrchar\\cyrzh ", ""],
         "\u0437":["\\cyrchar\\cyrz ", ""],
         "\u0438":["\\cyrchar\\cyri ", ""],
         "\u0439":["\\cyrchar\\cyrishrt ", ""],
         "\u043A":["\\cyrchar\\cyrk ", ""],
         "\u043B":["\\cyrchar\\cyrl ", ""],
         "\u043C":["\\cyrchar\\cyrm ", ""],
         "\u043D":["\\cyrchar\\cyrn ", ""],
         "\u043E":["\\cyrchar\\cyro ", ""],
         "\u043F":["\\cyrchar\\cyrp ", ""],
         "\u0440":["\\cyrchar\\cyrr ", ""],
         "\u0441":["\\cyrchar\\cyrs ", ""],
         "\u0442":["\\cyrchar\\cyrt ", ""],
         "\u0443":["\\cyrchar\\cyru ", ""],
         "\u0444":["\\cyrchar\\cyrf ", ""],
         "\u0445":["\\cyrchar\\cyrh ", ""],
         "\u0446":["\\cyrchar\\cyrc ", ""],
         "\u0447":["\\cyrchar\\cyrch ", ""],
         "\u0448":["\\cyrchar\\cyrsh ", ""],
         "\u0449":["\\cyrchar\\cyrshch ", ""],
         "\u044A":["\\cyrchar\\cyrhrdsn ", ""],
         "\u044B":["\\cyrchar\\cyrery ", ""],
         "\u044C":["\\cyrchar\\cyrsftsn ", ""],
         "\u044D":["\\cyrchar\\cyrerev ", ""],
         "\u044E":["\\cyrchar\\cyryu ", ""],
         "\u044F":["\\cyrchar\\cyrya ", ""],
         "\u0451":["\\cyrchar\\cyryo ", ""],
         "\u0452":["\\cyrchar\\cyrdje ", ""],
         "\u0453":["\\cyrchar{\\'\\cyrg}", ""],
         "\u0454":["\\cyrchar\\cyrie ", ""],
         "\u0455":["\\cyrchar\\cyrdze ", ""],
         "\u0456":["\\cyrchar\\cyrii ", ""],
         "\u0457":["\\cyrchar\\cyryi ", ""],
         "\u0458":["\\cyrchar\\cyrje ", ""],
         "\u0459":["\\cyrchar\\cyrlje ", ""],
         "\u045A":["\\cyrchar\\cyrnje ", ""],
         "\u045B":["\\cyrchar\\cyrtshe ", ""],
         "\u045C":["\\cyrchar{\\'\\cyrk}", ""],
         "\u045E":["\\cyrchar\\cyrushrt ", ""],
         "\u045F":["\\cyrchar\\cyrdzhe ", ""],
         "\u0460":["\\cyrchar\\CYROMEGA ", ""],
         "\u0461":["\\cyrchar\\cyromega ", ""],
         "\u0462":["\\cyrchar\\CYRYAT ", ""],
         "\u0464":["\\cyrchar\\CYRIOTE ", ""],
         "\u0465":["\\cyrchar\\cyriote ", ""],
         "\u0466":["\\cyrchar\\CYRLYUS ", ""],
         "\u0467":["\\cyrchar\\cyrlyus ", ""],
         "\u0468":["\\cyrchar\\CYRIOTLYUS ", ""],
         "\u0469":["\\cyrchar\\cyriotlyus ", ""],
         "\u046A":["\\cyrchar\\CYRBYUS ", ""],
         "\u046C":["\\cyrchar\\CYRIOTBYUS ", ""],
         "\u046D":["\\cyrchar\\cyriotbyus ", ""],
         "\u046E":["\\cyrchar\\CYRKSI ", ""],
         "\u046F":["\\cyrchar\\cyrksi ", ""],
         "\u0470":["\\cyrchar\\CYRPSI ", ""],
         "\u0471":["\\cyrchar\\cyrpsi ", ""],
         "\u0472":["\\cyrchar\\CYRFITA ", ""],
         "\u0474":["\\cyrchar\\CYRIZH ", ""],
         "\u0478":["\\cyrchar\\CYRUK ", ""],
         "\u0479":["\\cyrchar\\cyruk ", ""],
         "\u047A":["\\cyrchar\\CYROMEGARND ", ""],
         "\u047B":["\\cyrchar\\cyromegarnd ", ""],
         "\u047C":["\\cyrchar\\CYROMEGATITLO ", ""],
         "\u047D":["\\cyrchar\\cyromegatitlo ", ""],
         "\u047E":["\\cyrchar\\CYROT ", ""],
         "\u047F":["\\cyrchar\\cyrot ", ""],
         "\u0480":["\\cyrchar\\CYRKOPPA ", ""],
         "\u0481":["\\cyrchar\\cyrkoppa ", ""],
         "\u0482":["\\cyrchar\\cyrthousands ", ""],
         "\u0488":["\\cyrchar\\cyrhundredthousands ", ""],
         "\u0489":["\\cyrchar\\cyrmillions ", ""],
         "\u048C":["\\cyrchar\\CYRSEMISFTSN ", ""],
         "\u048D":["\\cyrchar\\cyrsemisftsn ", ""],
         "\u048E":["\\cyrchar\\CYRRTICK ", ""],
         "\u048F":["\\cyrchar\\cyrrtick ", ""],
         "\u0490":["\\cyrchar\\CYRGUP ", ""],
         "\u0491":["\\cyrchar\\cyrgup ", ""],
         "\u0492":["\\cyrchar\\CYRGHCRS ", ""],
         "\u0493":["\\cyrchar\\cyrghcrs ", ""],
         "\u0494":["\\cyrchar\\CYRGHK ", ""],
         "\u0495":["\\cyrchar\\cyrghk ", ""],
         "\u0496":["\\cyrchar\\CYRZHDSC ", ""],
         "\u0497":["\\cyrchar\\cyrzhdsc ", ""],
         "\u0498":["\\cyrchar\\CYRZDSC ", ""],
         "\u0499":["\\cyrchar\\cyrzdsc ", ""],
         "\u049A":["\\cyrchar\\CYRKDSC ", ""],
         "\u049B":["\\cyrchar\\cyrkdsc ", ""],
         "\u049C":["\\cyrchar\\CYRKVCRS ", ""],
         "\u049D":["\\cyrchar\\cyrkvcrs ", ""],
         "\u049E":["\\cyrchar\\CYRKHCRS ", ""],
         "\u049F":["\\cyrchar\\cyrkhcrs ", ""],
         "\u04A0":["\\cyrchar\\CYRKBEAK ", ""],
         "\u04A1":["\\cyrchar\\cyrkbeak ", ""],
         "\u04A2":["\\cyrchar\\CYRNDSC ", ""],
         "\u04A3":["\\cyrchar\\cyrndsc ", ""],
         "\u04A4":["\\cyrchar\\CYRNG ", ""],
         "\u04A5":["\\cyrchar\\cyrng ", ""],
         "\u04A6":["\\cyrchar\\CYRPHK ", ""],
         "\u04A7":["\\cyrchar\\cyrphk ", ""],
         "\u04A8":["\\cyrchar\\CYRABHHA ", ""],
         "\u04A9":["\\cyrchar\\cyrabhha ", ""],
         "\u04AA":["\\cyrchar\\CYRSDSC ", ""],
         "\u04AB":["\\cyrchar\\cyrsdsc ", ""],
         "\u04AC":["\\cyrchar\\CYRTDSC ", ""],
         "\u04AD":["\\cyrchar\\cyrtdsc ", ""],
         "\u04AE":["\\cyrchar\\CYRY ", ""],
         "\u04AF":["\\cyrchar\\cyry ", ""],
         "\u04B0":["\\cyrchar\\CYRYHCRS ", ""],
         "\u04B1":["\\cyrchar\\cyryhcrs ", ""],
         "\u04B2":["\\cyrchar\\CYRHDSC ", ""],
         "\u04B3":["\\cyrchar\\cyrhdsc ", ""],
         "\u04B4":["\\cyrchar\\CYRTETSE ", ""],
         "\u04B5":["\\cyrchar\\cyrtetse ", ""],
         "\u04B6":["\\cyrchar\\CYRCHRDSC ", ""],
         "\u04B7":["\\cyrchar\\cyrchrdsc ", ""],
         "\u04B8":["\\cyrchar\\CYRCHVCRS ", ""],
         "\u04B9":["\\cyrchar\\cyrchvcrs ", ""],
         "\u04BA":["\\cyrchar\\CYRSHHA ", ""],
         "\u04BB":["\\cyrchar\\cyrshha ", ""],
         "\u04BC":["\\cyrchar\\CYRABHCH ", ""],
         "\u04BD":["\\cyrchar\\cyrabhch ", ""],
         "\u04BE":["\\cyrchar\\CYRABHCHDSC ", ""],
         "\u04BF":["\\cyrchar\\cyrabhchdsc ", ""],
         "\u04C0":["\\cyrchar\\CYRpalochka ", ""],
         "\u04C3":["\\cyrchar\\CYRKHK ", ""],
         "\u04C4":["\\cyrchar\\cyrkhk ", ""],
         "\u04C7":["\\cyrchar\\CYRNHK ", ""],
         "\u04C8":["\\cyrchar\\cyrnhk ", ""],
         "\u04CB":["\\cyrchar\\CYRCHLDSC ", ""],
         "\u04CC":["\\cyrchar\\cyrchldsc ", ""],
         "\u04D4":["\\cyrchar\\CYRAE ", ""],
         "\u04D5":["\\cyrchar\\cyrae ", ""],
         "\u04D8":["\\cyrchar\\CYRSCHWA ", ""],
         "\u04D9":["\\cyrchar\\cyrschwa ", ""],
         "\u04E0":["\\cyrchar\\CYRABHDZE ", ""],
         "\u04E1":["\\cyrchar\\cyrabhdze ", ""],
         "\u04E8":["\\cyrchar\\CYROTLD ", ""],
         "\u04E9":["\\cyrchar\\cyrotld ", ""],
         "\u2002":["\\hspace{0.6em}", " "],
         "\u2003":["\\hspace{1em}", " "],
         "\u2004":["\\hspace{0.33em}", " "],
         "\u2005":["\\hspace{0.25em}", " "],
         "\u2006":["\\hspace{0.166em}", " "],
         "\u2007":["\\hphantom{0}", " "],
         "\u2008":["\\hphantom{,}", " "],
         "\u2009":["\\hspace{0.167em}", " "],
         "\u2009-0200A-0200A":["\\;", " "],
         "\u200A":["\\mkern1mu ", ""],
         "\u2016":["\\Vert ", " "],
         "\u2025":["..", " "],
         "\u2030":["\\textperthousand ", ""],
         "\u2031":["\\textpertenthousand ", ""],
         "\u2034":["{'''}", ""],
         "\u2039":["\\guilsinglleft ", ""],
         "\u203A":["\\guilsinglright ", ""],
         "\u2057":["''''", ""],
         "\u205F":["\\mkern4mu ", ""],
         "\u2060":["\\nolinebreak ", ""],
         "\u20A7":["\\ensuremath{\\Elzpes}", ""],
         "\u20AC":["\\mbox{\\texteuro} ", ""],
         "\u20DB":["\\dddot ", ""],
         "\u20DC":["\\ddddot ", ""],
         "\u2102":["\\mathbb{C}", "C"],
         "\u210A":["\\mathscr{g}", "g"],
         "\u210B":["\\mathscr{H}", "H"],
         "\u210C":["\\mathfrak{H}", "H"],
         "\u210D":["\\mathbb{H}", "H"],
         "\u210F":["\\hslash ", ""],
         "\u2110":["\\mathscr{I}", "I"],
         "\u2111":["\\mathfrak{I}", "I"],
         "\u2112":["\\mathscr{L}", "L"],
         "\u2113":["\\mathscr{l}", "l"],
         "\u2115":["\\mathbb{N}", "N"],
         "\u2116":["\\cyrchar\\textnumero ", ""],
         "\u2118":["\\wp ", "p"],
         "\u2119":["\\mathbb{P}", "P"],
         "\u211A":["\\mathbb{Q}", "Q"],
         "\u211B":["\\mathscr{R}", "R"],
         "\u211C":["\\mathfrak{R}", "R"],
         "\u211D":["\\mathbb{R}", "R"],
         "\u211E":["\\Elzxrat ", ""],
         "\u2122":["\\texttrademark ", ""],
         "\u2124":["\\mathbb{Z}", "Z"],
         "\u2127":["\\mho ", ""],
         "\u2128":["\\mathfrak{Z}", "Z"],
         "\u2129":["\\ElsevierGlyph{2129}", ""],
         "\u212C":["\\mathscr{B}", "B"],
         "\u212D":["\\mathfrak{C}", "C"],
         "\u212F":["\\mathscr{e}", "e"],
         "\u2130":["\\mathscr{E}", "E"],
         "\u2131":["\\mathscr{F}", "F"],
         "\u2133":["\\mathscr{M}", "M"],
         "\u2134":["\\mathscr{o}", "o"],
         "\u2135":["\\aleph ", ""],
         "\u2136":["\\beth ", ""],
         "\u2137":["\\gimel ", ""],
         "\u2138":["\\daleth ", ""],
         "\u2195":["\\updownarrow ", " "],
         "\u2196":["\\nwarrow ", " "],
         "\u2197":["\\nearrow ", " "],
         "\u2198":["\\searrow ", " "],
         "\u2199":["\\swarrow ", " "],
         "\u219A":["\\nleftarrow ", " "],
         "\u219B":["\\nrightarrow ", " "],
         "\u219C":["\\arrowwaveright ", " "],
         "\u219D":["\\arrowwaveright ", " "],
         "\u219E":["\\twoheadleftarrow ", " "],
         "\u21A0":["\\twoheadrightarrow ", " "],
         "\u21A2":["\\leftarrowtail ", " "],
         "\u21A3":["\\rightarrowtail ", " "],
         "\u21A6":["\\mapsto ", ""],
         "\u21A9":["\\hookleftarrow ", " "],
         "\u21AA":["\\hookrightarrow ", " "],
         "\u21AB":["\\looparrowleft ", " "],
         "\u21AC":["\\looparrowright ", " "],
         "\u21AD":["\\leftrightsquigarrow ", " "],
         "\u21AE":["\\nleftrightarrow ", " "],
         "\u21B0":["\\Lsh ", ""],
         "\u21B1":["\\Rsh ", ""],
         "\u21B3":["\\ElsevierGlyph{21B3}", ""],
         "\u21B6":["\\curvearrowleft ", " "],
         "\u21B7":["\\curvearrowright ", " "],
         "\u21BA":["\\circlearrowleft ", " "],
         "\u21BB":["\\circlearrowright ", " "],
         "\u21BC":["\\leftharpoonup ", " "],
         "\u21BD":["\\leftharpoondown ", " "],
         "\u21BE":["\\upharpoonright ", " "],
         "\u21BF":["\\upharpoonleft ", " "],
         "\u21C0":["\\rightharpoonup ", " "],
         "\u21C1":["\\rightharpoondown ", " "],
         "\u21C2":["\\downharpoonright ", " "],
         "\u21C3":["\\downharpoonleft ", " "],
         "\u21C4":["\\rightleftarrows ", " "],
         "\u21C5":["\\dblarrowupdown ", " "],
         "\u21C6":["\\leftrightarrows ", " "],
         "\u21C7":["\\leftleftarrows ", " "],
         "\u21C8":["\\upuparrows ", " "],
         "\u21C9":["\\rightrightarrows ", " "],
         "\u21CA":["\\downdownarrows ", " "],
         "\u21CB":["\\leftrightharpoons ", " "],
         "\u21CC":["\\rightleftharpoons ", " "],
         "\u21CD":["\\nLeftarrow ", " "],
         "\u21CE":["\\nLeftrightarrow ", " "],
         "\u21CF":["\\nRightarrow ", " "],
         "\u21D0":["\\Leftarrow ", " "],
         "\u21D1":["\\Uparrow ", " "],
         "\u21D2":["\\Rightarrow ", " "],
         "\u21D3":["\\Downarrow ", " "],
         "\u21D4":["\\Leftrightarrow ", " "],
         "\u21D5":["\\Updownarrow ", " "],
         "\u21DA":["\\Lleftarrow ", " "],
         "\u21DB":["\\Rrightarrow ", " "],
         "\u21DD":["\\rightsquigarrow ", " "],
         "\u21F5":["\\DownArrowUpArrow ", " "],
         "\u2200":["\\forall ", " "],
         "\u2201":["\\complement ", " "],
         "\u2202":["\\partial ", " "],
         "\u2203":["\\exists ", " "],
         "\u2204":["\\nexists ", " "],
         "\u2205":["\\varnothing ", " "],
         "\u2207":["\\nabla ", " "],
         "\u2208":["\\in ", " "],
         "\u2209":["\\not\\in ", " "],
         "\u220B":["\\ni ", " "],
         "\u220C":["\\not\\ni ", " "],
         "\u220F":["\\prod ", " "],
         "\u2210":["\\coprod ", " "],
         "\u2211":["\\sum ", " "],
         "\u2213":["\\mp ", " "],
         "\u2214":["\\dotplus ", " "],
         "\u2216":["\\setminus ", " "],
         "\u2217":["{_\\ast}", " "],
         "\u2218":["\\circ ", " "],
         "\u2219":["\\bullet ", " "],
         "\u221A":["\\surd ", " "],
         "\u221D":["\\propto ", " "],
         "\u221F":["\\rightangle ", ""],
         "\u2220":["\\angle ", " "],
         "\u2221":["\\measuredangle ", " "],
         "\u2222":["\\sphericalangle ", " "],
         "\u2223":["\\mid ", " "],
         "\u2224":["\\nmid ", " "],
         "\u2225":["\\parallel ", " "],
         "\u2226":["\\nparallel ", " "],
         "\u2227":["\\wedge ", " "],
         "\u2228":["\\vee ", " "],
         "\u2229":["\\cap ", " "],
         "\u222A":["\\cup ", " "],
         "\u222B":["\\int ", " "],
         "\u222C":["\\int\\!\\int ", " "],
         "\u222D":["\\int\\!\\int\\!\\int ", " "],
         "\u222E":["\\oint ", " "],
         "\u222F":["\\surfintegral ", " "],
         "\u2230":["\\volintegral ", " "],
         "\u2231":["\\clwintegral ", " "],
         "\u2232":["\\ElsevierGlyph{2232}", " "],
         "\u2233":["\\ElsevierGlyph{2233}", " "],
         "\u2234":["\\therefore ", " "],
         "\u2235":["\\because ", " "],
         "\u2237":["\\Colon ", " "],
         "\u2238":["\\ElsevierGlyph{2238}", " "],
         "\u223A":["\\mathbin{{:}\\!\\!{-}\\!\\!{:}}", " "],
         "\u223B":["\\homothetic ", " "],
         "\u223C":["\\sim ", ""],
         "\u223D":["\\backsim ", ""],
         "\u223E":["\\lazysinv ", ""],
         "\u2240":["\\wr ", ""],
         "\u2241":["\\not\\sim ", " "],
         "\u2242":["\\ElsevierGlyph{2242}", ""],
         "\u2242-00338":["\\NotEqualTilde ", ""],
         "\u2243":["\\simeq ", " "],
         "\u2244":["\\not\\simeq ", " "],
         "\u2245":["\\cong ", ""],
         "\u2246":["\\approxnotequal ", " "],
         "\u2247":["\\not\\cong ", ""],
         "\u2248":["\\approx ", " "],
         "\u2249":["\\not\\approx ", " "],
         "\u224A":["\\approxeq ", " "],
         "\u224B":["\\tildetrpl ", " "],
         "\u224B-00338":["\\not\\apid ", " "],
         "\u224C":["\\allequal ", " "],
         "\u224D":["\\asymp ", " "],
         "\u224E":["\\Bumpeq ", " "],
         "\u224E-00338":["\\NotHumpDownHump ", " "],
         "\u224F":["\\bumpeq ", " "],
         "\u224F-00338":["\\NotHumpEqual ", " "],
         "\u2250":["\\doteq ", " "],
         "\u2250-00338":["\\not\\doteq", " "],
         "\u2251":["\\doteqdot ", " "],
         "\u2252":["\\fallingdotseq ", " "],
         "\u2253":["\\risingdotseq ", " "],
         "\u2254":[":=", " "],
         "\u2255":["=:", " "],
         "\u2256":["\\eqcirc ", " "],
         "\u2257":["\\circeq ", " "],
         "\u2259":["\\estimates ", " "],
         "\u225A":["\\ElsevierGlyph{225A}", " "],
         "\u225B":["\\starequal ", " "],
         "\u225C":["\\triangleq ", " "],
         "\u225F":["\\ElsevierGlyph{225F}", " "],
         "\u2260":["\\not =", " "],
         "\u2261":["\\equiv ", " "],
         "\u2262":["\\not\\equiv ", " "],
         "\u2264":["\\leq ", " "],
         "\u2265":["\\geq ", " "],
         "\u2266":["\\leqq ", " "],
         "\u2267":["\\geqq ", " "],
         "\u2268":["\\lneqq ", " "],
         "\u2268-0FE00":["\\lvertneqq ", " "],
         "\u2269":["\\gneqq ", " "],
         "\u2269-0FE00":["\\gvertneqq ", " "],
         "\u226A":["\\ll ", " "],
         "\u226A-00338":["\\NotLessLess ", " "],
         "\u226B":["\\gg ", " "],
         "\u226B-00338":["\\NotGreaterGreater ", " "],
         "\u226C":["\\between ", " "],
         "\u226D":["\\not\\kern-0.3em\\times ", " "],
         "\u226E":["\\not&lt;", " "],
         "\u226F":["\\not&gt;", " "],
         "\u2270":["\\not\\leq ", " "],
         "\u2271":["\\not\\geq ", " "],
         "\u2272":["\\lessequivlnt ", " "],
         "\u2273":["\\greaterequivlnt ", " "],
         "\u2274":["\\ElsevierGlyph{2274}", " "],
         "\u2275":["\\ElsevierGlyph{2275}", " "],
         "\u2276":["\\lessgtr ", " "],
         "\u2277":["\\gtrless ", " "],
         "\u2278":["\\notlessgreater ", " "],
         "\u2279":["\\notgreaterless ", " "],
         "\u227A":["\\prec ", " "],
         "\u227B":["\\succ ", " "],
         "\u227C":["\\preccurlyeq ", " "],
         "\u227D":["\\succcurlyeq ", " "],
         "\u227E":["\\precapprox ", " "],
         "\u227E-00338":["\\NotPrecedesTilde ", " "],
         "\u227F":["\\succapprox ", " "],
         "\u227F-00338":["\\NotSucceedsTilde ", " "],
         "\u2280":["\\not\\prec ", " "],
         "\u2281":["\\not\\succ ", " "],
         "\u2282":["\\subset ", " "],
         "\u2283":["\\supset ", " "],
         "\u2284":["\\not\\subset ", " "],
         "\u2285":["\\not\\supset ", " "],
         "\u2286":["\\subseteq ", " "],
         "\u2287":["\\supseteq ", " "],
         "\u2288":["\\not\\subseteq ", " "],
         "\u2289":["\\not\\supseteq ", " "],
         "\u228A":["\\subsetneq ", " "],
         "\u228A-0FE00":["\\varsubsetneqq ", " "],
         "\u228B":["\\supsetneq ", " "],
         "\u228B-0FE00":["\\varsupsetneq ", " "],
         "\u228E":["\\uplus ", " "],
         "\u228F":["\\sqsubset ", " "],
         "\u228F-00338":["\\NotSquareSubset ", " "],
         "\u2290":["\\sqsupset ", " "],
         "\u2290-00338":["\\NotSquareSuperset ", " "],
         "\u2291":["\\sqsubseteq ", " "],
         "\u2292":["\\sqsupseteq ", " "],
         "\u2293":["\\sqcap ", " "],
         "\u2294":["\\sqcup ", " "],
         "\u2295":["\\oplus ", " "],
         "\u2296":["\\ominus ", " "],
         "\u2297":["\\otimes ", " "],
         "\u2298":["\\oslash ", " "],
         "\u2299":["\\odot ", " "],
         "\u229A":["\\circledcirc ", " "],
         "\u229B":["\\circledast ", " "],
         "\u229D":["\\circleddash ", " "],
         "\u229E":["\\boxplus ", " "],
         "\u229F":["\\boxminus ", " "],
         "\u22A0":["\\boxtimes ", " "],
         "\u22A1":["\\boxdot ", " "],
         "\u22A2":["\\vdash ", " "],
         "\u22A3":["\\dashv ", " "],
         "\u22A4":["\\top ", " "],
         "\u22A5":["\\perp ", " "],
         "\u22A7":["\\truestate ", " "],
         "\u22A8":["\\forcesextra ", " "],
         "\u22A9":["\\Vdash ", " "],
         "\u22AA":["\\Vvdash ", " "],
         "\u22AB":["\\VDash ", " "],
         "\u22AC":["\\nvdash ", " "],
         "\u22AD":["\\nvDash ", " "],
         "\u22AE":["\\nVdash ", " "],
         "\u22AF":["\\nVDash ", " "],
         "\u22B2":["\\vartriangleleft ", " "],
         "\u22B3":["\\vartriangleright ", " "],
         "\u22B4":["\\trianglelefteq ", " "],
         "\u22B5":["\\trianglerighteq ", " "],
         "\u22B6":["\\original ", " "],
         "\u22B7":["\\image ", " "],
         "\u22B8":["\\multimap ", " "],
         "\u22B9":["\\hermitconjmatrix ", " "],
         "\u22BA":["\\intercal ", " "],
         "\u22BB":["\\veebar ", " "],
         "\u22BE":["\\rightanglearc ", " "],
         "\u22C0":["\\ElsevierGlyph{22C0}", " "],
         "\u22C1":["\\ElsevierGlyph{22C1}", " "],
         "\u22C2":["\\bigcap ", " "],
         "\u22C3":["\\bigcup ", " "],
         "\u22C4":["\\diamond ", " "],
         "\u22C5":["\\cdot ", " "],
         "\u22C6":["\\star ", " "],
         "\u22C7":["\\divideontimes ", " "],
         "\u22C8":["\\bowtie ", " "],
         "\u22C9":["\\ltimes ", " "],
         "\u22CA":["\\rtimes ", " "],
         "\u22CB":["\\leftthreetimes ", " "],
         "\u22CC":["\\rightthreetimes ", " "],
         "\u22CD":["\\backsimeq ", " "],
         "\u22CE":["\\curlyvee ", " "],
         "\u22CF":["\\curlywedge ", " "],
         "\u22D0":["\\Subset ", " "],
         "\u22D1":["\\Supset ", " "],
         "\u22D2":["\\Cap ", " "],
         "\u22D3":["\\Cup ", " "],
         "\u22D4":["\\pitchfork ", " "],
         "\u22D6":["\\lessdot ", " "],
         "\u22D7":["\\gtrdot ", " "],
         "\u22D8":["\\verymuchless ", " "],
         "\u22D9":["\\verymuchgreater ", " "],
         "\u22DA":["\\lesseqgtr ", " "],
         "\u22DB":["\\gtreqless ", " "],
         "\u22DE":["\\curlyeqprec ", " "],
         "\u22DF":["\\curlyeqsucc ", " "],
         "\u22E2":["\\not\\sqsubseteq ", ""],
         "\u22E3":["\\not\\sqsupseteq ", ""],
         "\u22E5":["\\Elzsqspne ", " "],
         "\u22E6":["\\lnsim ", " "],
         "\u22E7":["\\gnsim ", " "],
         "\u22E8":["\\precedesnotsimilar ", " "],
         "\u22E9":["\\succnsim ", " "],
         "\u22EA":["\\ntriangleleft ", " "],
         "\u22EB":["\\ntriangleright ", " "],
         "\u22EC":["\\ntrianglelefteq ", " "],
         "\u22ED":["\\ntrianglerighteq ", " "],
         "\u22EE":["\\vdots ", " "],
         "\u22EF":["\\cdots ", " "],
         "\u22F0":["\\upslopeellipsis ", " "],
         "\u22F1":["\\downslopeellipsis ", " "],
         "\u2305":["\\barwedge ", " "],
         "\u2306":["\\perspcorrespond ", " "],
         "\u2308":["\\lceil ", " "],
         "\u2309":["\\rceil ", " "],
         "\u230A":["\\lfloor ", " "],
         "\u230B":["\\rfloor ", " "],
         "\u2315":["\\recorder ", " "],
         "\u2316":["\\mathchar\"2208", " "],
         "\u231C":["\\ulcorner ", " "],
         "\u231D":["\\urcorner ", " "],
         "\u231E":["\\llcorner ", " "],
         "\u231F":["\\lrcorner ", " "],
         "\u2322":["\\frown ", " "],
         "\u2323":["\\smile ", " "],
         "\u2329":["\\langle ", " "],
         "\u232A":["\\rangle ", " "],
         "\u233D":["\\ElsevierGlyph{E838}", " "],
         "\u23A3":["\\Elzdlcorn ", " "],
         "\u23B0":["\\lmoustache ", " "],
         "\u23B1":["\\rmoustache ", " "],
         "\u2423":["\\textvisiblespace ", " "],
         "\u2460":["\\ding{172}", ""],
         "\u2461":["\\ding{173}", ""],
         "\u2462":["\\ding{174}", ""],
         "\u2463":["\\ding{175}", ""],
         "\u2464":["\\ding{176}", ""],
         "\u2465":["\\ding{177}", ""],
         "\u2466":["\\ding{178}", ""],
         "\u2467":["\\ding{179}", ""],
         "\u2468":["\\ding{180}", ""],
         "\u2469":["\\ding{181}", ""],
         "\u24C8":["\\circledS ", ""],
         "\u2506":["\\Elzdshfnc ", ""],
         "\u2519":["\\Elzsqfnw ", ""],
         "\u2571":["\\diagup ", ""],
         "\u25A0":["\\ding{110}", ""],
         "\u25A1":["\\square ", ""],
         "\u25AA":["\\blacksquare ", ""],
         "\u25AD":["\\fbox{~~}", ""],
         "\u25AF":["\\Elzvrecto ", ""],
         "\u25B1":["\\ElsevierGlyph{E381}", ""],
         "\u25B2":["\\ding{115}", ""],
         "\u25B3":["\\bigtriangleup ", ""],
         "\u25B4":["\\blacktriangle ", ""],
         "\u25B5":["\\vartriangle ", ""],
         "\u25B8":["\\blacktriangleright ", ""],
         "\u25B9":["\\triangleright ", ""],
         "\u25BC":["\\ding{116}", ""],
         "\u25BD":["\\bigtriangledown ", ""],
         "\u25BE":["\\blacktriangledown ", ""],
         "\u25BF":["\\triangledown ", ""],
         "\u25C2":["\\blacktriangleleft ", ""],
         "\u25C3":["\\triangleleft ", ""],
         "\u25C6":["\\ding{117}", ""],
         "\u25CA":["\\lozenge ", ""],
         "\u25CB":["\\bigcirc ", ""],
         "\u25CF":["\\ding{108}", ""],
         "\u25D0":["\\Elzcirfl ", ""],
         "\u25D1":["\\Elzcirfr ", ""],
         "\u25D2":["\\Elzcirfb ", ""],
         "\u25D7":["\\ding{119}", ""],
         "\u25D8":["\\Elzrvbull ", ""],
         "\u25E7":["\\Elzsqfl ", ""],
         "\u25E8":["\\Elzsqfr ", ""],
         "\u25EA":["\\Elzsqfse ", ""],
         "\u25EF":["\\bigcirc ", ""],
         "\u2605":["\\ding{72}", ""],
         "\u2606":["\\ding{73}", ""],
         "\u260E":["\\ding{37}", ""],
         "\u261B":["\\ding{42}", ""],
         "\u261E":["\\ding{43}", ""],
         "\u263E":["\\rightmoon ", ""],
         "\u263F":["\\mercury ", ""],
         "\u2640":["\\venus ", ""],
         "\u2642":["\\male ", ""],
         "\u2643":["\\jupiter ", ""],
         "\u2644":["\\saturn ", ""],
         "\u2645":["\\uranus ", ""],
         "\u2646":["\\neptune ", ""],
         "\u2647":["\\pluto ", ""],
         "\u2648":["\\aries ", ""],
         "\u2649":["\\taurus ", ""],
         "\u264A":["\\gemini ", ""],
         "\u264B":["\\cancer ", ""],
         "\u264C":["\\leo ", ""],
         "\u264D":["\\virgo ", ""],
         "\u264E":["\\libra ", ""],
         "\u264F":["\\scorpio ", ""],
         "\u2650":["\\sagittarius ", ""],
         "\u2651":["\\capricornus ", ""],
         "\u2652":["\\aquarius ", ""],
         "\u2653":["\\pisces ", ""],
         "\u2660":["\\ding{171}", ""],
         "\u2662":["\\diamond ", ""],
         "\u2663":["\\ding{168}", ""],
         "\u2665":["\\ding{170}", ""],
         "\u2666":["\\ding{169}", ""],
         "\u2669":["\\quarternote ", ""],
         "\u266A":["\\eighthnote ", ""],
         "\u266D":["\\flat ", ""],
         "\u266E":["\\natural ", ""],
         "\u266F":["\\sharp ", ""],
         "\u2701":["\\ding{33}", ""],
         "\u2702":["\\ding{34}", ""],
         "\u2703":["\\ding{35}", ""],
         "\u2704":["\\ding{36}", ""],
         "\u2706":["\\ding{38}", ""],
         "\u2707":["\\ding{39}", ""],
         "\u2708":["\\ding{40}", ""],
         "\u2709":["\\ding{41}", ""],
         "\u270C":["\\ding{44}", ""],
         "\u270D":["\\ding{45}", ""],
         "\u270E":["\\ding{46}", ""],
         "\u270F":["\\ding{47}", ""],
         "\u2710":["\\ding{48}", ""],
         "\u2711":["\\ding{49}", ""],
         "\u2712":["\\ding{50}", ""],
         "\u2713":["\\ding{51}", ""],
         "\u2714":["\\ding{52}", ""],
         "\u2715":["\\ding{53}", ""],
         "\u2716":["\\ding{54}", ""],
         "\u2717":["\\ding{55}", ""],
         "\u2718":["\\ding{56}", ""],
         "\u2719":["\\ding{57}", ""],
         "\u271A":["\\ding{58}", ""],
         "\u271B":["\\ding{59}", ""],
         "\u271C":["\\ding{60}", ""],
         "\u271D":["\\ding{61}", ""],
         "\u271E":["\\ding{62}", ""],
         "\u271F":["\\ding{63}", ""],
         "\u2720":["\\ding{64}", ""],
         "\u2721":["\\ding{65}", ""],
         "\u2722":["\\ding{66}", ""],
         "\u2723":["\\ding{67}", ""],
         "\u2724":["\\ding{68}", ""],
         "\u2725":["\\ding{69}", ""],
         "\u2726":["\\ding{70}", ""],
         "\u2727":["\\ding{71}", ""],
         "\u2729":["\\ding{73}", ""],
         "\u272A":["\\ding{74}", ""],
         "\u272B":["\\ding{75}", ""],
         "\u272C":["\\ding{76}", ""],
         "\u272D":["\\ding{77}", ""],
         "\u272E":["\\ding{78}", ""],
         "\u272F":["\\ding{79}", ""],
         "\u2730":["\\ding{80}", ""],
         "\u2731":["\\ding{81}", ""],
         "\u2732":["\\ding{82}", ""],
         "\u2733":["\\ding{83}", ""],
         "\u2734":["\\ding{84}", ""],
         "\u2735":["\\ding{85}", ""],
         "\u2736":["\\ding{86}", ""],
         "\u2737":["\\ding{87}", ""],
         "\u2738":["\\ding{88}", ""],
         "\u2739":["\\ding{89}", ""],
         "\u273A":["\\ding{90}", ""],
         "\u273B":["\\ding{91}", ""],
         "\u273C":["\\ding{92}", ""],
         "\u273D":["\\ding{93}", ""],
         "\u273E":["\\ding{94}", ""],
         "\u273F":["\\ding{95}", ""],
         "\u2740":["\\ding{96}", ""],
         "\u2741":["\\ding{97}", ""],
         "\u2742":["\\ding{98}", ""],
         "\u2743":["\\ding{99}", ""],
         "\u2744":["\\ding{100}", ""],
         "\u2745":["\\ding{101}", ""],
         "\u2746":["\\ding{102}", ""],
         "\u2747":["\\ding{103}", ""],
         "\u2748":["\\ding{104}", ""],
         "\u2749":["\\ding{105}", ""],
         "\u274A":["\\ding{106}", ""],
         "\u274B":["\\ding{107}", ""],
         "\u274D":["\\ding{109}", ""],
         "\u274F":["\\ding{111}", ""],
         "\u2750":["\\ding{112}", ""],
         "\u2751":["\\ding{113}", ""],
         "\u2752":["\\ding{114}", ""],
         "\u2756":["\\ding{118}", ""],
         "\u2758":["\\ding{120}", ""],
         "\u2759":["\\ding{121}", ""],
         "\u275A":["\\ding{122}", ""],
         "\u275B":["\\ding{123}", ""],
         "\u275C":["\\ding{124}", ""],
         "\u275D":["\\ding{125}", ""],
         "\u275E":["\\ding{126}", ""],
         "\u2761":["\\ding{161}", ""],
         "\u2762":["\\ding{162}", ""],
         "\u2763":["\\ding{163}", ""],
         "\u2764":["\\ding{164}", ""],
         "\u2765":["\\ding{165}", ""],
         "\u2766":["\\ding{166}", ""],
         "\u2767":["\\ding{167}", ""],
         "\u2776":["\\ding{182}", ""],
         "\u2777":["\\ding{183}", ""],
         "\u2778":["\\ding{184}", ""],
         "\u2779":["\\ding{185}", ""],
         "\u277A":["\\ding{186}", ""],
         "\u277B":["\\ding{187}", ""],
         "\u277C":["\\ding{188}", ""],
         "\u277D":["\\ding{189}", ""],
         "\u277E":["\\ding{190}", ""],
         "\u277F":["\\ding{191}", ""],
         "\u2780":["\\ding{192}", ""],
         "\u2781":["\\ding{193}", ""],
         "\u2782":["\\ding{194}", ""],
         "\u2783":["\\ding{195}", ""],
         "\u2784":["\\ding{196}", ""],
         "\u2785":["\\ding{197}", ""],
         "\u2786":["\\ding{198}", ""],
         "\u2787":["\\ding{199}", ""],
         "\u2788":["\\ding{200}", ""],
         "\u2789":["\\ding{201}", ""],
         "\u278A":["\\ding{202}", ""],
         "\u278B":["\\ding{203}", ""],
         "\u278C":["\\ding{204}", ""],
         "\u278D":["\\ding{205}", ""],
         "\u278E":["\\ding{206}", ""],
         "\u278F":["\\ding{207}", ""],
         "\u2790":["\\ding{208}", ""],
         "\u2791":["\\ding{209}", ""],
         "\u2792":["\\ding{210}", ""],
         "\u2793":["\\ding{211}", ""],
         "\u2794":["\\ding{212}", ""],
         "\u2798":["\\ding{216}", ""],
         "\u2799":["\\ding{217}", ""],
         "\u279A":["\\ding{218}", ""],
         "\u279B":["\\ding{219}", ""],
         "\u279C":["\\ding{220}", ""],
         "\u279D":["\\ding{221}", ""],
         "\u279E":["\\ding{222}", ""],
         "\u279F":["\\ding{223}", ""],
         "\u27A0":["\\ding{224}", ""],
         "\u27A1":["\\ding{225}", ""],
         "\u27A2":["\\ding{226}", ""],
         "\u27A3":["\\ding{227}", ""],
         "\u27A4":["\\ding{228}", ""],
         "\u27A5":["\\ding{229}", ""],
         "\u27A6":["\\ding{230}", ""],
         "\u27A7":["\\ding{231}", ""],
         "\u27A8":["\\ding{232}", ""],
         "\u27A9":["\\ding{233}", ""],
         "\u27AA":["\\ding{234}", ""],
         "\u27AB":["\\ding{235}", ""],
         "\u27AC":["\\ding{236}", ""],
         "\u27AD":["\\ding{237}", ""],
         "\u27AE":["\\ding{238}", ""],
         "\u27AF":["\\ding{239}", ""],
         "\u27B1":["\\ding{241}", ""],
         "\u27B2":["\\ding{242}", ""],
         "\u27B3":["\\ding{243}", ""],
         "\u27B4":["\\ding{244}", ""],
         "\u27B5":["\\ding{245}", ""],
         "\u27B6":["\\ding{246}", ""],
         "\u27B7":["\\ding{247}", ""],
         "\u27B8":["\\ding{248}", ""],
         "\u27B9":["\\ding{249}", ""],
         "\u27BA":["\\ding{250}", ""],
         "\u27BB":["\\ding{251}", ""],
         "\u27BC":["\\ding{252}", ""],
         "\u27BD":["\\ding{253}", ""],
         "\u27BE":["\\ding{254}", ""],
         "\u27F5":["\\longleftarrow ", " "],
         "\u27F6":["\\longrightarrow ", " "],
         "\u27F7":["\\longleftrightarrow ", " "],
         "\u27F8":["\\Longleftarrow ", " "],
         "\u27F9":["\\Longrightarrow ", " "],
         "\u27FA":["\\Longleftrightarrow ", " "],
         "\u27FC":["\\longmapsto ", " "],
         "\u27FF":["\\sim\\joinrel\\leadsto", " "],
         "\u2905":["\\ElsevierGlyph{E212}", ""],
         "\u2912":["\\UpArrowBar ", " "],
         "\u2913":["\\DownArrowBar ", " "],
         "\u2923":["\\ElsevierGlyph{E20C}", ""],
         "\u2924":["\\ElsevierGlyph{E20D}", ""],
         "\u2925":["\\ElsevierGlyph{E20B}", ""],
         "\u2926":["\\ElsevierGlyph{E20A}", ""],
         "\u2927":["\\ElsevierGlyph{E211}", ""],
         "\u2928":["\\ElsevierGlyph{E20E}", ""],
         "\u2929":["\\ElsevierGlyph{E20F}", ""],
         "\u292A":["\\ElsevierGlyph{E210}", ""],
         "\u2933":["\\ElsevierGlyph{E21C}", ""],
         "\u2933-00338":["\\ElsevierGlyph{E21D}", ""],
         "\u2936":["\\ElsevierGlyph{E21A}", ""],
         "\u2937":["\\ElsevierGlyph{E219}", ""],
         "\u2940":["\\Elolarr ", ""],
         "\u2941":["\\Elorarr ", ""],
         "\u2942":["\\ElzRlarr ", ""],
         "\u2944":["\\ElzrLarr ", ""],
         "\u2947":["\\Elzrarrx ", ""],
         "\u294E":["\\LeftRightVector ", " "],
         "\u294F":["\\RightUpDownVector ", " "],
         "\u2950":["\\DownLeftRightVector ", " "],
         "\u2951":["\\LeftUpDownVector ", " "],
         "\u2952":["\\LeftVectorBar ", " "],
         "\u2953":["\\RightVectorBar ", " "],
         "\u2954":["\\RightUpVectorBar ", " "],
         "\u2955":["\\RightDownVectorBar ", " "],
         "\u2956":["\\DownLeftVectorBar ", " "],
         "\u2957":["\\DownRightVectorBar ", " "],
         "\u2958":["\\LeftUpVectorBar ", " "],
         "\u2959":["\\LeftDownVectorBar ", " "],
         "\u295A":["\\LeftTeeVector ", " "],
         "\u295B":["\\RightTeeVector ", " "],
         "\u295C":["\\RightUpTeeVector ", " "],
         "\u295D":["\\RightDownTeeVector ", " "],
         "\u295E":["\\DownLeftTeeVector ", " "],
         "\u295F":["\\DownRightTeeVector ", " "],
         "\u2960":["\\LeftUpTeeVector ", " "],
         "\u2961":["\\LeftDownTeeVector ", " "],
         "\u296E":["\\UpEquilibrium ", " "],
         "\u296F":["\\ReverseUpEquilibrium ", " "],
         "\u2970":["\\RoundImplies ", " "],
         "\u297C":["\\ElsevierGlyph{E214}", ""],
         "\u297D":["\\ElsevierGlyph{E215}", ""],
         "\u2980":["\\Elztfnc ", ""],
         "\u2985":["\\ElsevierGlyph{3018}", ""],
         "\u2986":["\\Elroang ", ""],
         "\u2993":["&lt;\\kern-0.58em(", ""],
         "\u2994":["\\ElsevierGlyph{E291}", ""],
         "\u2999":["\\Elzddfnc ", ""],
         "\u299C":["\\Angle ", ""],
         "\u29A0":["\\Elzlpargt ", ""],
         "\u29B5":["\\ElsevierGlyph{E260}", ""],
         "\u29B6":["\\ElsevierGlyph{E61B}", ""],
         "\u29CA":["\\ElzLap ", ""],
         "\u29CB":["\\Elzdefas ", ""],
         "\u29CF":["\\LeftTriangleBar ", " "],
         "\u29CF-00338":["\\NotLeftTriangleBar ", " "],
         "\u29D0":["\\RightTriangleBar ", " "],
         "\u29D0-00338":["\\NotRightTriangleBar ", " "],
         "\u29DC":["\\ElsevierGlyph{E372}", ""],
         "\u29EB":["\\blacklozenge ", ""],
         "\u29F4":["\\RuleDelayed ", ""],
         "\u2A04":["\\Elxuplus ", ""],
         "\u2A05":["\\ElzThr ", ""],
         "\u2A06":["\\Elxsqcup ", ""],
         "\u2A07":["\\ElzInf ", ""],
         "\u2A08":["\\ElzSup ", ""],
         "\u2A0D":["\\ElzCint ", ""],
         "\u2A0F":["\\clockoint ", ""],
         "\u2A10":["\\ElsevierGlyph{E395}", ""],
         "\u2A16":["\\sqrint ", ""],
         "\u2A25":["\\ElsevierGlyph{E25A}", ""],
         "\u2A2A":["\\ElsevierGlyph{E25B}", ""],
         "\u2A2D":["\\ElsevierGlyph{E25C}", ""],
         "\u2A2E":["\\ElsevierGlyph{E25D}", ""],
         "\u2A2F":["\\ElzTimes ", ""],
         "\u2A34":["\\ElsevierGlyph{E25E}", ""],
         "\u2A35":["\\ElsevierGlyph{E25E}", ""],
         "\u2A3C":["\\ElsevierGlyph{E259}", ""],
         "\u2A3F":["\\amalg ", ""],
         "\u2A53":["\\ElzAnd ", ""],
         "\u2A54":["\\ElzOr ", ""],
         "\u2A55":["\\ElsevierGlyph{E36E}", ""],
         "\u2A56":["\\ElOr ", ""],
         "\u2A5E":["\\perspcorrespond ", ""],
         "\u2A5F":["\\Elzminhat ", ""],
         "\u2A63":["\\ElsevierGlyph{225A}", ""],
         "\u2A6E":["\\stackrel{*}{=}", ""],
         "\u2A75":["\\Equal ", ""],
         "\u2A7D":["\\leqslant ", ""],
         "\u2A7D-00338":["\\nleqslant ", ""],
         "\u2A7E":["\\geqslant ", ""],
         "\u2A7E-00338":["\\ngeqslant ", ""],
         "\u2A85":["\\lessapprox ", ""],
         "\u2A86":["\\gtrapprox ", ""],
         "\u2A87":["\\lneq ", ""],
         "\u2A88":["\\gneq ", ""],
         "\u2A89":["\\lnapprox ", ""],
         "\u2A8A":["\\gnapprox ", ""],
         "\u2A8B":["\\lesseqqgtr ", ""],
         "\u2A8C":["\\gtreqqless ", ""],
         "\u2A95":["\\eqslantless ", ""],
         "\u2A96":["\\eqslantgtr ", ""],
         "\u2A9D":["\\Pisymbol{ppi020}{117}", ""],
         "\u2A9E":["\\Pisymbol{ppi020}{105}", ""],
         "\u2AA1":["\\NestedLessLess ", ""],
         "\u2AA1-00338":["\\NotNestedLessLess ", ""],
         "\u2AA2":["\\NestedGreaterGreater ", ""],
         "\u2AA2-00338":["\\NotNestedGreaterGreater ", ""],
         "\u2AAF":["\\preceq ", ""],
         "\u2AAF-00338":["\\not\\preceq ", ""],
         "\u2AB0":["\\succeq ", ""],
         "\u2AB0-00338":["\\not\\succeq ", ""],
         "\u2AB5":["\\precneqq ", ""],
         "\u2AB6":["\\succneqq ", ""],
         "\u2AB7":["\\precapprox ", ""],
         "\u2AB8":["\\succapprox ", ""],
         "\u2AB9":["\\precnapprox ", ""],
         "\u2ABA":["\\succnapprox ", ""],
         "\u2AC5":["\\subseteqq ", ""],
         "\u2AC5-00338":["\\nsubseteqq ", ""],
         "\u2AC6":["\\supseteqq ", ""],
         "\u2AC6-00338":["\\nsupseteqq", ""],
         "\u2ACB":["\\subsetneqq ", ""],
         "\u2ACC":["\\supsetneqq ", ""],
         "\u2AEB":["\\ElsevierGlyph{E30D}", ""],
         "\u2AF6":["\\Elztdcol ", ""],
         "\u2AFD":["{{/}\\!\\!{/}}", ""],
         "\u2AFD-020E5":["{\\rlap{\\textbackslash}{{/}\\!\\!{/}}}", ""],
         "\u300A":["\\ElsevierGlyph{300A}", ""],
         "\u300B":["\\ElsevierGlyph{300B}", ""],
         "\u3018":["\\ElsevierGlyph{3018}", ""],
         "\u3019":["\\ElsevierGlyph{3019}", ""],
         "\u301A":["\\openbracketleft ", ""],
         "\u301B":["\\openbracketright ", ""],
         "\uD400":["\\mathbf{A}", "A"],
         "\uD401":["\\mathbf{B}", "B"],
         "\uD402":["\\mathbf{C}", "C"],
         "\uD403":["\\mathbf{D}", "D"],
         "\uD404":["\\mathbf{E}", "E"],
         "\uD405":["\\mathbf{F}", "F"],
         "\uD406":["\\mathbf{G}", "G"],
         "\uD407":["\\mathbf{H}", "H"],
         "\uD408":["\\mathbf{I}", "I"],
         "\uD409":["\\mathbf{J}", "J"],
         "\uD40A":["\\mathbf{K}", "K"],
         "\uD40B":["\\mathbf{L}", "L"],
         "\uD40C":["\\mathbf{M}", "M"],
         "\uD40D":["\\mathbf{N}", "N"],
         "\uD40E":["\\mathbf{O}", "O"],
         "\uD40F":["\\mathbf{P}", "P"],
         "\uD410":["\\mathbf{Q}", "Q"],
         "\uD411":["\\mathbf{R}", "R"],
         "\uD412":["\\mathbf{S}", "S"],
         "\uD413":["\\mathbf{T}", "T"],
         "\uD414":["\\mathbf{U}", "U"],
         "\uD415":["\\mathbf{V}", "V"],
         "\uD416":["\\mathbf{W}", "W"],
         "\uD417":["\\mathbf{X}", "X"],
         "\uD418":["\\mathbf{Y}", "Y"],
         "\uD419":["\\mathbf{Z}", "Z"],
         "\uD41A":["\\mathbf{a}", "a"],
         "\uD41B":["\\mathbf{b}", "b"],
         "\uD41C":["\\mathbf{c}", "c"],
         "\uD41D":["\\mathbf{d}", "d"],
         "\uD41E":["\\mathbf{e}", "e"],
         "\uD41F":["\\mathbf{f}", "f"],
         "\uD420":["\\mathbf{g}", "g"],
         "\uD421":["\\mathbf{h}", "h"],
         "\uD422":["\\mathbf{i}", "i"],
         "\uD423":["\\mathbf{j}", "j"],
         "\uD424":["\\mathbf{k}", "k"],
         "\uD425":["\\mathbf{l}", "l"],
         "\uD426":["\\mathbf{m}", "m"],
         "\uD427":["\\mathbf{n}", "n"],
         "\uD428":["\\mathbf{o}", "o"],
         "\uD429":["\\mathbf{p}", "p"],
         "\uD42A":["\\mathbf{q}", "q"],
         "\uD42B":["\\mathbf{r}", "r"],
         "\uD42C":["\\mathbf{s}", "s"],
         "\uD42D":["\\mathbf{t}", "t"],
         "\uD42E":["\\mathbf{u}", "u"],
         "\uD42F":["\\mathbf{v}", "v"],
         "\uD430":["\\mathbf{w}", "w"],
         "\uD431":["\\mathbf{x}", "x"],
         "\uD432":["\\mathbf{y}", "y"],
         "\uD433":["\\mathbf{z}", "z"],
         "\uD434":["\\mathsl{A}", "A"],
         "\uD435":["\\mathsl{B}", "B"],
         "\uD436":["\\mathsl{C}", "C"],
         "\uD437":["\\mathsl{D}", "D"],
         "\uD438":["\\mathsl{E}", "E"],
         "\uD439":["\\mathsl{F}", "F"],
         "\uD43A":["\\mathsl{G}", "G"],
         "\uD43B":["\\mathsl{H}", "H"],
         "\uD43C":["\\mathsl{I}", "I"],
         "\uD43D":["\\mathsl{J}", "J"],
         "\uD43E":["\\mathsl{K}", "K"],
         "\uD43F":["\\mathsl{L}", "L"],
         "\uD440":["\\mathsl{M}", "M"],
         "\uD441":["\\mathsl{N}", "N"],
         "\uD442":["\\mathsl{O}", "O"],
         "\uD443":["\\mathsl{P}", "P"],
         "\uD444":["\\mathsl{Q}", "Q"],
         "\uD445":["\\mathsl{R}", "R"],
         "\uD446":["\\mathsl{S}", "S"],
         "\uD447":["\\mathsl{T}", "T"],
         "\uD448":["\\mathsl{U}", "U"],
         "\uD449":["\\mathsl{V}", "V"],
         "\uD44A":["\\mathsl{W}", "W"],
         "\uD44B":["\\mathsl{X}", "X"],
         "\uD44C":["\\mathsl{Y}", "Y"],
         "\uD44D":["\\mathsl{Z}", "Z"],
         "\uD44E":["\\mathsl{a}", "a"],
         "\uD44F":["\\mathsl{b}", "b"],
         "\uD450":["\\mathsl{c}", "c"],
         "\uD451":["\\mathsl{d}", "d"],
         "\uD452":["\\mathsl{e}", "e"],
         "\uD453":["\\mathsl{f}", "f"],
         "\uD454":["\\mathsl{g}", "g"],
         "\uD455":["\\mathsl{h}", "h"],
         "\uD456":["\\mathsl{i}", "i"],
         "\uD457":["\\mathsl{j}", "j"],
         "\uD458":["\\mathsl{k}", "k"],
         "\uD459":["\\mathsl{l}", "l"],
         "\uD45A":["\\mathsl{m}", "m"],
         "\uD45B":["\\mathsl{n}", "n"],
         "\uD45C":["\\mathsl{o}", "o"],
         "\uD45D":["\\mathsl{p}", "p"],
         "\uD45E":["\\mathsl{q}", "q"],
         "\uD45F":["\\mathsl{r}", "r"],
         "\uD460":["\\mathsl{s}", "s"],
         "\uD461":["\\mathsl{t}", "t"],
         "\uD462":["\\mathsl{u}", "u"],
         "\uD463":["\\mathsl{v}", "v"],
         "\uD464":["\\mathsl{w}", "w"],
         "\uD465":["\\mathsl{x}", "x"],
         "\uD466":["\\mathsl{y}", "y"],
         "\uD467":["\\mathsl{z}", "z"],
         "\uD468":["\\mathbit{A}", "A"],
         "\uD469":["\\mathbit{B}", "B"],
         "\uD46A":["\\mathbit{C}", "C"],
         "\uD46B":["\\mathbit{D}", "D"],
         "\uD46C":["\\mathbit{E}", "E"],
         "\uD46D":["\\mathbit{F}", "F"],
         "\uD46E":["\\mathbit{G}", "G"],
         "\uD46F":["\\mathbit{H}", "H"],
         "\uD470":["\\mathbit{I}", "I"],
         "\uD471":["\\mathbit{J}", "J"],
         "\uD472":["\\mathbit{K}", "K"],
         "\uD473":["\\mathbit{L}", "L"],
         "\uD474":["\\mathbit{M}", "M"],
         "\uD475":["\\mathbit{N}", "N"],
         "\uD476":["\\mathbit{O}", "O"],
         "\uD477":["\\mathbit{P}", "P"],
         "\uD478":["\\mathbit{Q}", "Q"],
         "\uD479":["\\mathbit{R}", "R"],
         "\uD47A":["\\mathbit{S}", "S"],
         "\uD47B":["\\mathbit{T}", "T"],
         "\uD47C":["\\mathbit{U}", "U"],
         "\uD47D":["\\mathbit{V}", "V"],
         "\uD47E":["\\mathbit{W}", "W"],
         "\uD47F":["\\mathbit{X}", "X"],
         "\uD480":["\\mathbit{Y}", "Y"],
         "\uD481":["\\mathbit{Z}", "Z"],
         "\uD482":["\\mathbit{a}", "a"],
         "\uD483":["\\mathbit{b}", "b"],
         "\uD484":["\\mathbit{c}", "c"],
         "\uD485":["\\mathbit{d}", "d"],
         "\uD486":["\\mathbit{e}", "e"],
         "\uD487":["\\mathbit{f}", "f"],
         "\uD488":["\\mathbit{g}", "g"],
         "\uD489":["\\mathbit{h}", "h"],
         "\uD48A":["\\mathbit{i}", "i"],
         "\uD48B":["\\mathbit{j}", "j"],
         "\uD48C":["\\mathbit{k}", "k"],
         "\uD48D":["\\mathbit{l}", "l"],
         "\uD48E":["\\mathbit{m}", "m"],
         "\uD48F":["\\mathbit{n}", "n"],
         "\uD490":["\\mathbit{o}", "o"],
         "\uD491":["\\mathbit{p}", "p"],
         "\uD492":["\\mathbit{q}", "q"],
         "\uD493":["\\mathbit{r}", "r"],
         "\uD494":["\\mathbit{s}", "s"],
         "\uD495":["\\mathbit{t}", "t"],
         "\uD496":["\\mathbit{u}", "u"],
         "\uD497":["\\mathbit{v}", "v"],
         "\uD498":["\\mathbit{w}", "w"],
         "\uD499":["\\mathbit{x}", "x"],
         "\uD49A":["\\mathbit{y}", "y"],
         "\uD49B":["\\mathbit{z}", "z"],
         "\uD49C":["\\mathscr{A}", "A"],
         "\uD49E":["\\mathscr{C}", "C"],
         "\uD49F":["\\mathscr{D}", "D"],
         "\uD4A2":["\\mathscr{G}", "G"],
         "\uD4A5":["\\mathscr{J}", "J"],
         "\uD4A6":["\\mathscr{K}", "K"],
         "\uD4A9":["\\mathscr{N}", "N"],
         "\uD4AA":["\\mathscr{O}", "O"],
         "\uD4AB":["\\mathscr{P}", "P"],
         "\uD4AC":["\\mathscr{Q}", "Q"],
         "\uD4AE":["\\mathscr{S}", "S"],
         "\uD4AF":["\\mathscr{T}", "T"],
         "\uD4B0":["\\mathscr{U}", "U"],
         "\uD4B1":["\\mathscr{V}", "V"],
         "\uD4B2":["\\mathscr{W}", "W"],
         "\uD4B3":["\\mathscr{X}", "X"],
         "\uD4B4":["\\mathscr{Y}", "Y"],
         "\uD4B5":["\\mathscr{Z}", "Z"],
         "\uD4B6":["\\mathscr{a}", "a"],
         "\uD4B7":["\\mathscr{b}", "b"],
         "\uD4B8":["\\mathscr{c}", "c"],
         "\uD4B9":["\\mathscr{d}", "d"],
         "\uD4BB":["\\mathscr{f}", "f"],
         "\uD4BD":["\\mathscr{h}", "h"],
         "\uD4BE":["\\mathscr{i}", "i"],
         "\uD4BF":["\\mathscr{j}", "j"],
         "\uD4C0":["\\mathscr{k}", "k"],
         "\uD4C1":["\\mathscr{l}", "l"],
         "\uD4C2":["\\mathscr{m}", "m"],
         "\uD4C3":["\\mathscr{n}", "n"],
         "\uD4C5":["\\mathscr{p}", "p"],
         "\uD4C6":["\\mathscr{q}", "q"],
         "\uD4C7":["\\mathscr{r}", "r"],
         "\uD4C8":["\\mathscr{s}", "s"],
         "\uD4C9":["\\mathscr{t}", "t"],
         "\uD4CA":["\\mathscr{u}", "u"],
         "\uD4CB":["\\mathscr{v}", "v"],
         "\uD4CC":["\\mathscr{w}", "w"],
         "\uD4CD":["\\mathscr{x}", "x"],
         "\uD4CE":["\\mathscr{y}", "y"],
         "\uD4CF":["\\mathscr{z}", "z"],
         "\uD4D0":["\\mathmit{A}", "A"],
         "\uD4D1":["\\mathmit{B}", "B"],
         "\uD4D2":["\\mathmit{C}", "C"],
         "\uD4D3":["\\mathmit{D}", "D"],
         "\uD4D4":["\\mathmit{E}", "E"],
         "\uD4D5":["\\mathmit{F}", "F"],
         "\uD4D6":["\\mathmit{G}", "G"],
         "\uD4D7":["\\mathmit{H}", "H"],
         "\uD4D8":["\\mathmit{I}", "I"],
         "\uD4D9":["\\mathmit{J}", "J"],
         "\uD4DA":["\\mathmit{K}", "K"],
         "\uD4DB":["\\mathmit{L}", "L"],
         "\uD4DC":["\\mathmit{M}", "M"],
         "\uD4DD":["\\mathmit{N}", "N"],
         "\uD4DE":["\\mathmit{O}", "O"],
         "\uD4DF":["\\mathmit{P}", "P"],
         "\uD4E0":["\\mathmit{Q}", "Q"],
         "\uD4E1":["\\mathmit{R}", "R"],
         "\uD4E2":["\\mathmit{S}", "S"],
         "\uD4E3":["\\mathmit{T}", "T"],
         "\uD4E4":["\\mathmit{U}", "U"],
         "\uD4E5":["\\mathmit{V}", "V"],
         "\uD4E6":["\\mathmit{W}", "W"],
         "\uD4E7":["\\mathmit{X}", "X"],
         "\uD4E8":["\\mathmit{Y}", "Y"],
         "\uD4E9":["\\mathmit{Z}", "Z"],
         "\uD4EA":["\\mathmit{a}", "a"],
         "\uD4EB":["\\mathmit{b}", "b"],
         "\uD4EC":["\\mathmit{c}", "c"],
         "\uD4ED":["\\mathmit{d}", "d"],
         "\uD4EE":["\\mathmit{e}", "e"],
         "\uD4EF":["\\mathmit{f}", "f"],
         "\uD4F0":["\\mathmit{g}", "g"],
         "\uD4F1":["\\mathmit{h}", "h"],
         "\uD4F2":["\\mathmit{i}", "i"],
         "\uD4F3":["\\mathmit{j}", "j"],
         "\uD4F4":["\\mathmit{k}", "k"],
         "\uD4F5":["\\mathmit{l}", "l"],
         "\uD4F6":["\\mathmit{m}", "m"],
         "\uD4F7":["\\mathmit{n}", "n"],
         "\uD4F8":["\\mathmit{o}", "o"],
         "\uD4F9":["\\mathmit{p}", "p"],
         "\uD4FA":["\\mathmit{q}", "q"],
         "\uD4FB":["\\mathmit{r}", "r"],
         "\uD4FC":["\\mathmit{s}", "s"],
         "\uD4FD":["\\mathmit{t}", "t"],
         "\uD4FE":["\\mathmit{u}", "u"],
         "\uD4FF":["\\mathmit{v}", "v"],
         "\uD500":["\\mathmit{w}", "w"],
         "\uD501":["\\mathmit{x}", "x"],
         "\uD502":["\\mathmit{y}", "y"],
         "\uD503":["\\mathmit{z}", "z"],
         "\uD504":["\\mathfrak{A}", "A"],
         "\uD505":["\\mathfrak{B}", "B"],
         "\uD507":["\\mathfrak{D}", "D"],
         "\uD508":["\\mathfrak{E}", "E"],
         "\uD509":["\\mathfrak{F}", "F"],
         "\uD50A":["\\mathfrak{G}", "G"],
         "\uD50D":["\\mathfrak{J}", "J"],
         "\uD50E":["\\mathfrak{K}", "K"],
         "\uD50F":["\\mathfrak{L}", "L"],
         "\uD510":["\\mathfrak{M}", "M"],
         "\uD511":["\\mathfrak{N}", "N"],
         "\uD512":["\\mathfrak{O}", "O"],
         "\uD513":["\\mathfrak{P}", "P"],
         "\uD514":["\\mathfrak{Q}", "Q"],
         "\uD516":["\\mathfrak{S}", "S"],
         "\uD517":["\\mathfrak{T}", "T"],
         "\uD518":["\\mathfrak{U}", "U"],
         "\uD519":["\\mathfrak{V}", "V"],
         "\uD51A":["\\mathfrak{W}", "W"],
         "\uD51B":["\\mathfrak{X}", "X"],
         "\uD51C":["\\mathfrak{Y}", "Y"],
         "\uD51E":["\\mathfrak{a}", "a"],
         "\uD51F":["\\mathfrak{b}", "b"],
         "\uD520":["\\mathfrak{c}", "c"],
         "\uD521":["\\mathfrak{d}", "d"],
         "\uD522":["\\mathfrak{e}", "e"],
         "\uD523":["\\mathfrak{f}", "f"],
         "\uD524":["\\mathfrak{g}", "g"],
         "\uD525":["\\mathfrak{h}", "h"],
         "\uD526":["\\mathfrak{i}", "i"],
         "\uD527":["\\mathfrak{j}", "j"],
         "\uD528":["\\mathfrak{k}", "k"],
         "\uD529":["\\mathfrak{l}", "l"],
         "\uD52A":["\\mathfrak{m}", "m"],
         "\uD52B":["\\mathfrak{n}", "n"],
         "\uD52C":["\\mathfrak{o}", "o"],
         "\uD52D":["\\mathfrak{p}", "p"],
         "\uD52E":["\\mathfrak{q}", "q"],
         "\uD52F":["\\mathfrak{r}", "r"],
         "\uD530":["\\mathfrak{s}", "s"],
         "\uD531":["\\mathfrak{t}", "t"],
         "\uD532":["\\mathfrak{u}", "u"],
         "\uD533":["\\mathfrak{v}", "v"],
         "\uD534":["\\mathfrak{w}", "w"],
         "\uD535":["\\mathfrak{x}", "x"],
         "\uD536":["\\mathfrak{y}", "y"],
         "\uD537":["\\mathfrak{z}", "z"],
         "\uD538":["\\mathbb{A}", "A"],
         "\uD539":["\\mathbb{B}", "B"],
         "\uD53B":["\\mathbb{D}", "D"],
         "\uD53C":["\\mathbb{E}", "E"],
         "\uD53D":["\\mathbb{F}", "F"],
         "\uD53E":["\\mathbb{G}", "G"],
         "\uD540":["\\mathbb{I}", "I"],
         "\uD541":["\\mathbb{J}", "J"],
         "\uD542":["\\mathbb{K}", "K"],
         "\uD543":["\\mathbb{L}", "L"],
         "\uD544":["\\mathbb{M}", "M"],
         "\uD546":["\\mathbb{O}", "O"],
         "\uD54A":["\\mathbb{S}", "S"],
         "\uD54B":["\\mathbb{T}", "T"],
         "\uD54C":["\\mathbb{U}", "U"],
         "\uD54D":["\\mathbb{V}", "V"],
         "\uD54E":["\\mathbb{W}", "W"],
         "\uD54F":["\\mathbb{X}", "X"],
         "\uD550":["\\mathbb{Y}", "Y"],
         "\uD552":["\\mathbb{a}", "a"],
         "\uD553":["\\mathbb{b}", "b"],
         "\uD554":["\\mathbb{c}", "c"],
         "\uD555":["\\mathbb{d}", "d"],
         "\uD556":["\\mathbb{e}", "e"],
         "\uD557":["\\mathbb{f}", "f"],
         "\uD558":["\\mathbb{g}", "g"],
         "\uD559":["\\mathbb{h}", "h"],
         "\uD55A":["\\mathbb{i}", "i"],
         "\uD55B":["\\mathbb{j}", "j"],
         "\uD55C":["\\mathbb{k}", "k"],
         "\uD55D":["\\mathbb{l}", "l"],
         "\uD55E":["\\mathbb{m}", "m"],
         "\uD55F":["\\mathbb{n}", "n"],
         "\uD560":["\\mathbb{o}", "o"],
         "\uD561":["\\mathbb{p}", "p"],
         "\uD562":["\\mathbb{q}", "q"],
         "\uD563":["\\mathbb{r}", "r"],
         "\uD564":["\\mathbb{s}", "s"],
         "\uD565":["\\mathbb{t}", "t"],
         "\uD566":["\\mathbb{u}", "u"],
         "\uD567":["\\mathbb{v}", "v"],
         "\uD568":["\\mathbb{w}", "w"],
         "\uD569":["\\mathbb{x}", "x"],
         "\uD56A":["\\mathbb{y}", "y"],
         "\uD56B":["\\mathbb{z}", "z"],
         "\uD56C":["\\mathslbb{A}", "A"],
         "\uD56D":["\\mathslbb{B}", "B"],
         "\uD56E":["\\mathslbb{C}", "C"],
         "\uD56F":["\\mathslbb{D}", "D"],
         "\uD570":["\\mathslbb{E}", "E"],
         "\uD571":["\\mathslbb{F}", "F"],
         "\uD572":["\\mathslbb{G}", "G"],
         "\uD573":["\\mathslbb{H}", "H"],
         "\uD574":["\\mathslbb{I}", "I"],
         "\uD575":["\\mathslbb{J}", "J"],
         "\uD576":["\\mathslbb{K}", "K"],
         "\uD577":["\\mathslbb{L}", "L"],
         "\uD578":["\\mathslbb{M}", "M"],
         "\uD579":["\\mathslbb{N}", "N"],
         "\uD57A":["\\mathslbb{O}", "O"],
         "\uD57B":["\\mathslbb{P}", "P"],
         "\uD57C":["\\mathslbb{Q}", "Q"],
         "\uD57D":["\\mathslbb{R}", "R"],
         "\uD57E":["\\mathslbb{S}", "S"],
         "\uD57F":["\\mathslbb{T}", "T"],
         "\uD580":["\\mathslbb{U}", "U"],
         "\uD581":["\\mathslbb{V}", "V"],
         "\uD582":["\\mathslbb{W}", "W"],
         "\uD583":["\\mathslbb{X}", "X"],
         "\uD584":["\\mathslbb{Y}", "Y"],
         "\uD585":["\\mathslbb{Z}", "Z"],
         "\uD586":["\\mathslbb{a}", "a"],
         "\uD587":["\\mathslbb{b}", "b"],
         "\uD588":["\\mathslbb{c}", "c"],
         "\uD589":["\\mathslbb{d}", "d"],
         "\uD58A":["\\mathslbb{e}", "e"],
         "\uD58B":["\\mathslbb{f}", "f"],
         "\uD58C":["\\mathslbb{g}", "g"],
         "\uD58D":["\\mathslbb{h}", "h"],
         "\uD58E":["\\mathslbb{i}", "i"],
         "\uD58F":["\\mathslbb{j}", "j"],
         "\uD590":["\\mathslbb{k}", "k"],
         "\uD591":["\\mathslbb{l}", "l"],
         "\uD592":["\\mathslbb{m}", "m"],
         "\uD593":["\\mathslbb{n}", "n"],
         "\uD594":["\\mathslbb{o}", "o"],
         "\uD595":["\\mathslbb{p}", "p"],
         "\uD596":["\\mathslbb{q}", "q"],
         "\uD597":["\\mathslbb{r}", "r"],
         "\uD598":["\\mathslbb{s}", "s"],
         "\uD599":["\\mathslbb{t}", "t"],
         "\uD59A":["\\mathslbb{u}", "u"],
         "\uD59B":["\\mathslbb{v}", "v"],
         "\uD59C":["\\mathslbb{w}", "w"],
         "\uD59D":["\\mathslbb{x}", "x"],
         "\uD59E":["\\mathslbb{y}", "y"],
         "\uD59F":["\\mathslbb{z}", "z"],
         "\uD5A0":["\\mathsf{A}", "A"],
         "\uD5A1":["\\mathsf{B}", "B"],
         "\uD5A2":["\\mathsf{C}", "C"],
         "\uD5A3":["\\mathsf{D}", "D"],
         "\uD5A4":["\\mathsf{E}", "E"],
         "\uD5A5":["\\mathsf{F}", "F"],
         "\uD5A6":["\\mathsf{G}", "G"],
         "\uD5A7":["\\mathsf{H}", "H"],
         "\uD5A8":["\\mathsf{I}", "I"],
         "\uD5A9":["\\mathsf{J}", "J"],
         "\uD5AA":["\\mathsf{K}", "K"],
         "\uD5AB":["\\mathsf{L}", "L"],
         "\uD5AC":["\\mathsf{M}", "M"],
         "\uD5AD":["\\mathsf{N}", "N"],
         "\uD5AE":["\\mathsf{O}", "O"],
         "\uD5AF":["\\mathsf{P}", "P"],
         "\uD5B0":["\\mathsf{Q}", "Q"],
         "\uD5B1":["\\mathsf{R}", "R"],
         "\uD5B2":["\\mathsf{S}", "S"],
         "\uD5B3":["\\mathsf{T}", "T"],
         "\uD5B4":["\\mathsf{U}", "U"],
         "\uD5B5":["\\mathsf{V}", "V"],
         "\uD5B6":["\\mathsf{W}", "W"],
         "\uD5B7":["\\mathsf{X}", "X"],
         "\uD5B8":["\\mathsf{Y}", "Y"],
         "\uD5B9":["\\mathsf{Z}", "Z"],
         "\uD5BA":["\\mathsf{a}", "a"],
         "\uD5BB":["\\mathsf{b}", "b"],
         "\uD5BC":["\\mathsf{c}", "c"],
         "\uD5BD":["\\mathsf{d}", "d"],
         "\uD5BE":["\\mathsf{e}", "e"],
         "\uD5BF":["\\mathsf{f}", "f"],
         "\uD5C0":["\\mathsf{g}", "g"],
         "\uD5C1":["\\mathsf{h}", "h"],
         "\uD5C2":["\\mathsf{i}", "i"],
         "\uD5C3":["\\mathsf{j}", "j"],
         "\uD5C4":["\\mathsf{k}", "k"],
         "\uD5C5":["\\mathsf{l}", "l"],
         "\uD5C6":["\\mathsf{m}", "m"],
         "\uD5C7":["\\mathsf{n}", "n"],
         "\uD5C8":["\\mathsf{o}", "o"],
         "\uD5C9":["\\mathsf{p}", "p"],
         "\uD5CA":["\\mathsf{q}", "q"],
         "\uD5CB":["\\mathsf{r}", "r"],
         "\uD5CC":["\\mathsf{s}", "s"],
         "\uD5CD":["\\mathsf{t}", "t"],
         "\uD5CE":["\\mathsf{u}", "u"],
         "\uD5CF":["\\mathsf{v}", "v"],
         "\uD5D0":["\\mathsf{w}", "w"],
         "\uD5D1":["\\mathsf{x}", "x"],
         "\uD5D2":["\\mathsf{y}", "y"],
         "\uD5D3":["\\mathsf{z}", "z"],
         "\uD5D4":["\\mathsfbf{A}", "A"],
         "\uD5D5":["\\mathsfbf{B}", "B"],
         "\uD5D6":["\\mathsfbf{C}", "C"],
         "\uD5D7":["\\mathsfbf{D}", "D"],
         "\uD5D8":["\\mathsfbf{E}", "E"],
         "\uD5D9":["\\mathsfbf{F}", "F"],
         "\uD5DA":["\\mathsfbf{G}", "G"],
         "\uD5DB":["\\mathsfbf{H}", "H"],
         "\uD5DC":["\\mathsfbf{I}", "I"],
         "\uD5DD":["\\mathsfbf{J}", "J"],
         "\uD5DE":["\\mathsfbf{K}", "K"],
         "\uD5DF":["\\mathsfbf{L}", "L"],
         "\uD5E0":["\\mathsfbf{M}", "M"],
         "\uD5E1":["\\mathsfbf{N}", "N"],
         "\uD5E2":["\\mathsfbf{O}", "O"],
         "\uD5E3":["\\mathsfbf{P}", "P"],
         "\uD5E4":["\\mathsfbf{Q}", "Q"],
         "\uD5E5":["\\mathsfbf{R}", "R"],
         "\uD5E6":["\\mathsfbf{S}", "S"],
         "\uD5E7":["\\mathsfbf{T}", "T"],
         "\uD5E8":["\\mathsfbf{U}", "U"],
         "\uD5E9":["\\mathsfbf{V}", "V"],
         "\uD5EA":["\\mathsfbf{W}", "W"],
         "\uD5EB":["\\mathsfbf{X}", "X"],
         "\uD5EC":["\\mathsfbf{Y}", "Y"],
         "\uD5ED":["\\mathsfbf{Z}", "Z"],
         "\uD5EE":["\\mathsfbf{a}", "a"],
         "\uD5EF":["\\mathsfbf{b}", "b"],
         "\uD5F0":["\\mathsfbf{c}", "c"],
         "\uD5F1":["\\mathsfbf{d}", "d"],
         "\uD5F2":["\\mathsfbf{e}", "e"],
         "\uD5F3":["\\mathsfbf{f}", "f"],
         "\uD5F4":["\\mathsfbf{g}", "g"],
         "\uD5F5":["\\mathsfbf{h}", "h"],
         "\uD5F6":["\\mathsfbf{i}", "i"],
         "\uD5F7":["\\mathsfbf{j}", "j"],
         "\uD5F8":["\\mathsfbf{k}", "k"],
         "\uD5F9":["\\mathsfbf{l}", "l"],
         "\uD5FA":["\\mathsfbf{m}", "m"],
         "\uD5FB":["\\mathsfbf{n}", "n"],
         "\uD5FC":["\\mathsfbf{o}", "o"],
         "\uD5FD":["\\mathsfbf{p}", "p"],
         "\uD5FE":["\\mathsfbf{q}", "q"],
         "\uD5FF":["\\mathsfbf{r}", "r"],
         "\uD600":["\\mathsfbf{s}", "s"],
         "\uD601":["\\mathsfbf{t}", "t"],
         "\uD602":["\\mathsfbf{u}", "u"],
         "\uD603":["\\mathsfbf{v}", "v"],
         "\uD604":["\\mathsfbf{w}", "w"],
         "\uD605":["\\mathsfbf{x}", "x"],
         "\uD606":["\\mathsfbf{y}", "y"],
         "\uD607":["\\mathsfbf{z}", "a"],
         "\uD608":["\\mathsfsl{A}", "A"],
         "\uD609":["\\mathsfsl{B}", "B"],
         "\uD60A":["\\mathsfsl{C}", "C"],
         "\uD60B":["\\mathsfsl{D}", "D"],
         "\uD60C":["\\mathsfsl{E}", "E"],
         "\uD60D":["\\mathsfsl{F}", "F"],
         "\uD60E":["\\mathsfsl{G}", "G"],
         "\uD60F":["\\mathsfsl{H}", "H"],
         "\uD610":["\\mathsfsl{I}", "I"],
         "\uD611":["\\mathsfsl{J}", "J"],
         "\uD612":["\\mathsfsl{K}", "K"],
         "\uD613":["\\mathsfsl{L}", "L"],
         "\uD614":["\\mathsfsl{M}", "M"],
         "\uD615":["\\mathsfsl{N}", "N"],
         "\uD616":["\\mathsfsl{O}", "O"],
         "\uD617":["\\mathsfsl{P}", "P"],
         "\uD618":["\\mathsfsl{Q}", "Q"],
         "\uD619":["\\mathsfsl{R}", "R"],
         "\uD61A":["\\mathsfsl{S}", "S"],
         "\uD61B":["\\mathsfsl{T}", "T"],
         "\uD61C":["\\mathsfsl{U}", "U"],
         "\uD61D":["\\mathsfsl{V}", "V"],
         "\uD61E":["\\mathsfsl{W}", "W"],
         "\uD61F":["\\mathsfsl{X}", "X"],
         "\uD620":["\\mathsfsl{Y}", "Y"],
         "\uD621":["\\mathsfsl{Z}", "Z"],
         "\uD622":["\\mathsfsl{a}", "a"],
         "\uD623":["\\mathsfsl{b}", "b"],
         "\uD624":["\\mathsfsl{c}", "c"],
         "\uD625":["\\mathsfsl{d}", "d"],
         "\uD626":["\\mathsfsl{e}", "e"],
         "\uD627":["\\mathsfsl{f}", "f"],
         "\uD628":["\\mathsfsl{g}", "g"],
         "\uD629":["\\mathsfsl{h}", "h"],
         "\uD62A":["\\mathsfsl{i}", "i"],
         "\uD62B":["\\mathsfsl{j}", "j"],
         "\uD62C":["\\mathsfsl{k}", "k"],
         "\uD62D":["\\mathsfsl{l}", "l"],
         "\uD62E":["\\mathsfsl{m}", "m"],
         "\uD62F":["\\mathsfsl{n}", "n"],
         "\uD630":["\\mathsfsl{o}", "o"],
         "\uD631":["\\mathsfsl{p}", "p"],
         "\uD632":["\\mathsfsl{q}", "q"],
         "\uD633":["\\mathsfsl{r}", "r"],
         "\uD634":["\\mathsfsl{s}", "s"],
         "\uD635":["\\mathsfsl{t}", "t"],
         "\uD636":["\\mathsfsl{u}", "u"],
         "\uD637":["\\mathsfsl{v}", "v"],
         "\uD638":["\\mathsfsl{w}", "w"],
         "\uD639":["\\mathsfsl{x}", "x"],
         "\uD63A":["\\mathsfsl{y}", "y"],
         "\uD63B":["\\mathsfsl{z}", "z"],
         "\uD63C":["\\mathsfbfsl{A}", "A"],
         "\uD63D":["\\mathsfbfsl{B}", "B"],
         "\uD63E":["\\mathsfbfsl{C}", "C"],
         "\uD63F":["\\mathsfbfsl{D}", "D"],
         "\uD640":["\\mathsfbfsl{E}", "E"],
         "\uD641":["\\mathsfbfsl{F}", "F"],
         "\uD642":["\\mathsfbfsl{G}", "G"],
         "\uD643":["\\mathsfbfsl{H}", "H"],
         "\uD644":["\\mathsfbfsl{I}", "I"],
         "\uD645":["\\mathsfbfsl{J}", "J"],
         "\uD646":["\\mathsfbfsl{K}", "K"],
         "\uD647":["\\mathsfbfsl{L}", "L"],
         "\uD648":["\\mathsfbfsl{M}", "M"],
         "\uD649":["\\mathsfbfsl{N}", "N"],
         "\uD64A":["\\mathsfbfsl{O}", "O"],
         "\uD64B":["\\mathsfbfsl{P}", "P"],
         "\uD64C":["\\mathsfbfsl{Q}", "Q"],
         "\uD64D":["\\mathsfbfsl{R}", "R"],
         "\uD64E":["\\mathsfbfsl{S}", "S"],
         "\uD64F":["\\mathsfbfsl{T}", "T"],
         "\uD650":["\\mathsfbfsl{U}", "U"],
         "\uD651":["\\mathsfbfsl{V}", "V"],
         "\uD652":["\\mathsfbfsl{W}", "W"],
         "\uD653":["\\mathsfbfsl{X}", "X"],
         "\uD654":["\\mathsfbfsl{Y}", "Y"],
         "\uD655":["\\mathsfbfsl{Z}", "Z"],
         "\uD656":["\\mathsfbfsl{a}", "a"],
         "\uD657":["\\mathsfbfsl{b}", "b"],
         "\uD658":["\\mathsfbfsl{c}", "c"],
         "\uD659":["\\mathsfbfsl{d}", "d"],
         "\uD65A":["\\mathsfbfsl{e}", "e"],
         "\uD65B":["\\mathsfbfsl{f}", "f"],
         "\uD65C":["\\mathsfbfsl{g}", "g"],
         "\uD65D":["\\mathsfbfsl{h}", "h"],
         "\uD65E":["\\mathsfbfsl{i}", "i"],
         "\uD65F":["\\mathsfbfsl{j}", "j"],
         "\uD660":["\\mathsfbfsl{k}", "k"],
         "\uD661":["\\mathsfbfsl{l}", "l"],
         "\uD662":["\\mathsfbfsl{m}", "m"],
         "\uD663":["\\mathsfbfsl{n}", "n"],
         "\uD664":["\\mathsfbfsl{o}", "o"],
         "\uD665":["\\mathsfbfsl{p}", "p"],
         "\uD666":["\\mathsfbfsl{q}", "q"],
         "\uD667":["\\mathsfbfsl{r}", "r"],
         "\uD668":["\\mathsfbfsl{s}", "s"],
         "\uD669":["\\mathsfbfsl{t}", "t"],
         "\uD66A":["\\mathsfbfsl{u}", "u"],
         "\uD66B":["\\mathsfbfsl{v}", "v"],
         "\uD66C":["\\mathsfbfsl{w}", "w"],
         "\uD66D":["\\mathsfbfsl{x}", "x"],
         "\uD66E":["\\mathsfbfsl{y}", "y"],
         "\uD66F":["\\mathsfbfsl{z}", "z"],
         "\uD670":["\\mathtt{A}", "A"],
         "\uD671":["\\mathtt{B}", "B"],
         "\uD672":["\\mathtt{C}", "C"],
         "\uD673":["\\mathtt{D}", "D"],
         "\uD674":["\\mathtt{E}", "E"],
         "\uD675":["\\mathtt{F}", "F"],
         "\uD676":["\\mathtt{G}", "G"],
         "\uD677":["\\mathtt{H}", "H"],
         "\uD678":["\\mathtt{I}", "I"],
         "\uD679":["\\mathtt{J}", "J"],
         "\uD67A":["\\mathtt{K}", "K"],
         "\uD67B":["\\mathtt{L}", "L"],
         "\uD67C":["\\mathtt{M}", "M"],
         "\uD67D":["\\mathtt{N}", "N"],
         "\uD67E":["\\mathtt{O}", "O"],
         "\uD67F":["\\mathtt{P}", "P"],
         "\uD680":["\\mathtt{Q}", "Q"],
         "\uD681":["\\mathtt{R}", "R"],
         "\uD682":["\\mathtt{S}", "S"],
         "\uD683":["\\mathtt{T}", "T"],
         "\uD684":["\\mathtt{U}", "U"],
         "\uD685":["\\mathtt{V}", "V"],
         "\uD686":["\\mathtt{W}", "W"],
         "\uD687":["\\mathtt{X}", "X"],
         "\uD688":["\\mathtt{Y}", "Y"],
         "\uD689":["\\mathtt{Z}", "Z"],
         "\uD68A":["\\mathtt{a}", "a"],
         "\uD68B":["\\mathtt{b}", "b"],
         "\uD68C":["\\mathtt{c}", "c"],
         "\uD68D":["\\mathtt{d}", "d"],
         "\uD68E":["\\mathtt{e}", "e"],
         "\uD68F":["\\mathtt{f}", "f"],
         "\uD690":["\\mathtt{g}", "g"],
         "\uD691":["\\mathtt{h}", "h"],
         "\uD692":["\\mathtt{i}", "i"],
         "\uD693":["\\mathtt{j}", "j"],
         "\uD694":["\\mathtt{k}", "k"],
         "\uD695":["\\mathtt{l}", "l"],
         "\uD696":["\\mathtt{m}", "m"],
         "\uD697":["\\mathtt{n}", "n"],
         "\uD698":["\\mathtt{o}", "o"],
         "\uD699":["\\mathtt{p}", "p"],
         "\uD69A":["\\mathtt{q}", "q"],
         "\uD69B":["\\mathtt{r}", "r"],
         "\uD69C":["\\mathtt{s}", "s"],
         "\uD69D":["\\mathtt{t}", "t"],
         "\uD69E":["\\mathtt{u}", "u"],
         "\uD69F":["\\mathtt{v}", "v"],
         "\uD6A0":["\\mathtt{w}", "w"],
         "\uD6A1":["\\mathtt{x}", "x"],
         "\uD6A2":["\\mathtt{y}", "y"],
         "\uD6A3":["\\mathtt{z}", "z"],
         "\uD6A8":["\\mathbf{\\Alpha}", "Alpha"],
         "\uD6A9":["\\mathbf{\\Beta}", "Beta"],
         "\uD6AA":["\\mathbf{\\Gamma}", "Gamma"],
         "\uD6AB":["\\mathbf{\\Delta}", "Delta"],
         "\uD6AC":["\\mathbf{\\Epsilon}", "Epsilon"],
         "\uD6AD":["\\mathbf{\\Zeta}", "Zeta"],
         "\uD6AE":["\\mathbf{\\Eta}", "Eta"],
         "\uD6AF":["\\mathbf{\\Theta}", "Theta"],
         "\uD6B0":["\\mathbf{\\Iota}", "Iota"],
         "\uD6B1":["\\mathbf{\\Kappa}", "Kappa"],
         "\uD6B2":["\\mathbf{\\Lambda}", "Lambda"],
         "\uD6B5":["\\mathbf{\\Xi}", "Xi"],
         "\uD6B7":["\\mathbf{\\Pi}", "Pi"],
         "\uD6B8":["\\mathbf{\\Rho}", "Rho"],
         "\uD6B9":["\\mathbf{\\vartheta}", "theta"],
         "\uD6BA":["\\mathbf{\\Sigma}", "Sigma"],
         "\uD6BB":["\\mathbf{\\Tau}", "Tau"],
         "\uD6BC":["\\mathbf{\\Upsilon}", "Upsilon"],
         "\uD6BD":["\\mathbf{\\Phi}", "Phi"],
         "\uD6BE":["\\mathbf{\\Chi}", "Chi"],
         "\uD6BF":["\\mathbf{\\Psi}", "Psi"],
         "\uD6C0":["\\mathbf{\\Omega}", "Omega"],
         "\uD6C1":["\\mathbf{\\nabla}", ""],
         "\uD6C2":["\\mathbf{\\Alpha}", "Alpha"],
         "\uD6C3":["\\mathbf{\\Beta}", "Beta"],
         "\uD6C4":["\\mathbf{\\Gamma}", "Gamma"],
         "\uD6C5":["\\mathbf{\\Delta}", "Delta"],
         "\uD6C6":["\\mathbf{\\Epsilon}", "Epsilon"],
         "\uD6C7":["\\mathbf{\\Zeta}", "Zeta"],
         "\uD6C8":["\\mathbf{\\Eta}", "Eta"],
         "\uD6C9":["\\mathbf{\\theta}", "theta"],
         "\uD6CA":["\\mathbf{\\Iota}", "Iota"],
         "\uD6CB":["\\mathbf{\\Kappa}", "Kappa"],
         "\uD6CC":["\\mathbf{\\Lambda}", "Lambda"],
         "\uD6CF":["\\mathbf{\\Xi}", "Xi"],
         "\uD6D1":["\\mathbf{\\Pi}", "Pi"],
         "\uD6D2":["\\mathbf{\\Rho}", "Rho"],
         "\uD6D3":["\\mathbf{\\varsigma}", "sigma"],
         "\uD6D4":["\\mathbf{\\Sigma}", "Sigma"],
         "\uD6D5":["\\mathbf{\\Tau}", "Tau"],
         "\uD6D6":["\\mathbf{\\Upsilon}", "Upsilon"],
         "\uD6D7":["\\mathbf{\\Phi}", "Phi"],
         "\uD6D8":["\\mathbf{\\Chi}", "Chi"],
         "\uD6D9":["\\mathbf{\\Psi}", "Psi"],
         "\uD6DA":["\\mathbf{\\Omega}", "Omega"],
         "\uD6DB":["\\partial ", ""],
         "\uD6DC":["\\in", ""],
         "\uD6DD":["\\mathbf{\\vartheta}", "theta"],
         "\uD6DE":["\\mathbf{\\varkappa}", "kappa"],
         "\uD6DF":["\\mathbf{\\phi}", "phi"],
         "\uD6E0":["\\mathbf{\\varrho}", "rho"],
         "\uD6E1":["\\mathbf{\\varpi}", "pi"],
         "\uD6E2":["\\mathsl{\\Alpha}", "Alpha"],
         "\uD6E3":["\\mathsl{\\Beta}", "Beta"],
         "\uD6E4":["\\mathsl{\\Gamma}", "Gamma"],
         "\uD6E5":["\\mathsl{\\Delta}", "Delta"],
         "\uD6E6":["\\mathsl{\\Epsilon}", "Epsilon"],
         "\uD6E7":["\\mathsl{\\Zeta}", "Zeta"],
         "\uD6E8":["\\mathsl{\\Eta}", "Eta"],
         "\uD6E9":["\\mathsl{\\Theta}", "Theta"],
         "\uD6EA":["\\mathsl{\\Iota}", "Iota"],
         "\uD6EB":["\\mathsl{\\Kappa}", "Kappa"],
         "\uD6EC":["\\mathsl{\\Lambda}", "Lambda"],
         "\uD6EF":["\\mathsl{\\Xi}", "Xi"],
         "\uD6F1":["\\mathsl{\\Pi}", "Pi"],
         "\uD6F2":["\\mathsl{\\Rho}", "Rho"],
         "\uD6F3":["\\mathsl{\\vartheta}", "theta"],
         "\uD6F4":["\\mathsl{\\Sigma}", "Sigma"],
         "\uD6F5":["\\mathsl{\\Tau}", "Tau"],
         "\uD6F6":["\\mathsl{\\Upsilon}", "Upsilon"],
         "\uD6F7":["\\mathsl{\\Phi}", "Phi"],
         "\uD6F8":["\\mathsl{\\Chi}", "Chi"],
         "\uD6F9":["\\mathsl{\\Psi}", "Psi"],
         "\uD6FA":["\\mathsl{\\Omega}", "Omega"],
         "\uD6FB":["\\mathsl{\\nabla}", ""],
         "\uD6FC":["\\mathsl{\\Alpha}", "Alpha"],
         "\uD6FD":["\\mathsl{\\Beta}", "Beta"],
         "\uD6FE":["\\mathsl{\\Gamma}", "Gamma"],
         "\uD6FF":["\\mathsl{\\Delta}", "Delta"],
         "\uD700":["\\mathsl{\\Epsilon}", "Epsilon"],
         "\uD701":["\\mathsl{\\Zeta}", "Zeta"],
         "\uD702":["\\mathsl{\\Eta}", "Eta"],
         "\uD703":["\\mathsl{\\Theta}", "Theta"],
         "\uD704":["\\mathsl{\\Iota}", "Iota"],
         "\uD705":["\\mathsl{\\Kappa}", "Kappa"],
         "\uD706":["\\mathsl{\\Lambda}", "Lambda"],
         "\uD709":["\\mathsl{\\Xi}", "Xi"],
         "\uD70B":["\\mathsl{\\Pi}", "Pi"],
         "\uD70C":["\\mathsl{\\Rho}", "Rho"],
         "\uD70D":["\\mathsl{\\varsigma}", "sigma"],
         "\uD70E":["\\mathsl{\\Sigma}", "Sigma"],
         "\uD70F":["\\mathsl{\\Tau}", "Tau"],
         "\uD710":["\\mathsl{\\Upsilon}", "Upsilon"],
         "\uD711":["\\mathsl{\\Phi}", "Phi"],
         "\uD712":["\\mathsl{\\Chi}", "Chi"],
         "\uD713":["\\mathsl{\\Psi}", "Psi"],
         "\uD714":["\\mathsl{\\Omega}", "Omega"],
         "\uD715":["\\partial ", ""],
         "\uD716":["\\in", ""],
         "\uD717":["\\mathsl{\\vartheta}", "theta"],
         "\uD718":["\\mathsl{\\varkappa}", "kappa"],
         "\uD719":["\\mathsl{\\phi}", "phi"],
         "\uD71A":["\\mathsl{\\varrho}", "rho"],
         "\uD71B":["\\mathsl{\\varpi}", "pi"],
         "\uD71C":["\\mathbit{\\Alpha}", "Alpha"],
         "\uD71D":["\\mathbit{\\Beta}", "Beta"],
         "\uD71E":["\\mathbit{\\Gamma}", "Gamma"],
         "\uD71F":["\\mathbit{\\Delta}", "Delta"],
         "\uD720":["\\mathbit{\\Epsilon}", "Epsilon"],
         "\uD721":["\\mathbit{\\Zeta}", "Zeta"],
         "\uD722":["\\mathbit{\\Eta}", "Eta"],
         "\uD723":["\\mathbit{\\Theta}", "Theta"],
         "\uD724":["\\mathbit{\\Iota}", "Iota"],
         "\uD725":["\\mathbit{\\Kappa}", "Kappa"],
         "\uD726":["\\mathbit{\\Lambda}", "Lambda"],
         "\uD729":["\\mathbit{\\Xi}", "Xi"],
         "\uD72B":["\\mathbit{\\Pi}", "Pi"],
         "\uD72C":["\\mathbit{\\Rho}", "Rho"],
         "\uD72D":["\\mathbit{O}", "O"],
         "\uD72E":["\\mathbit{\\Sigma}", "Sigma"],
         "\uD72F":["\\mathbit{\\Tau}", "Tau"],
         "\uD730":["\\mathbit{\\Upsilon}", "Upsilon"],
         "\uD731":["\\mathbit{\\Phi}", "Phi"],
         "\uD732":["\\mathbit{\\Chi}", "Chi"],
         "\uD733":["\\mathbit{\\Psi}", "Psi"],
         "\uD734":["\\mathbit{\\Omega}", "Omega"],
         "\uD735":["\\mathbit{\\nabla}", ""],
         "\uD736":["\\mathbit{\\Alpha}", "Alpha"],
         "\uD737":["\\mathbit{\\Beta}", "Beta"],
         "\uD738":["\\mathbit{\\Gamma}", "Gamma"],
         "\uD739":["\\mathbit{\\Delta}", "Delta"],
         "\uD73A":["\\mathbit{\\Epsilon}", "Epsilon"],
         "\uD73B":["\\mathbit{\\Zeta}", "Zeta"],
         "\uD73C":["\\mathbit{\\Eta}", "Eta"],
         "\uD73D":["\\mathbit{\\Theta}", "Theta"],
         "\uD73E":["\\mathbit{\\Iota}", "Iota"],
         "\uD73F":["\\mathbit{\\Kappa}", "Kappa"],
         "\uD740":["\\mathbit{\\Lambda}", "Lambda"],
         "\uD743":["\\mathbit{\\Xi}", "Xi"],
         "\uD745":["\\mathbit{\\Pi}", "Pi"],
         "\uD746":["\\mathbit{\\Rho}", "Rho"],
         "\uD747":["\\mathbit{\\varsigma}", "sigma"],
         "\uD748":["\\mathbit{\\Sigma}", "Sigma"],
         "\uD749":["\\mathbit{\\Tau}", "Tau"],
         "\uD74A":["\\mathbit{\\Upsilon}", "Upsilon"],
         "\uD74B":["\\mathbit{\\Phi}", "Phi"],
         "\uD74C":["\\mathbit{\\Chi}", "Chi"],
         "\uD74D":["\\mathbit{\\Psi}", "Psi"],
         "\uD74E":["\\mathbit{\\Omega}", "Omega"],
         "\uD74F":["\\partial ", ""],
         "\uD750":["\\in", ""],
         "\uD751":["\\mathbit{\\vartheta}", "theta"],
         "\uD752":["\\mathbit{\\varkappa}", "kappa"],
         "\uD753":["\\mathbit{\\phi}", "phi"],
         "\uD754":["\\mathbit{\\varrho}", "rho"],
         "\uD755":["\\mathbit{\\varpi}", "pi"],
         "\uD756":["\\mathsfbf{\\Alpha}", "Alpha"],
         "\uD757":["\\mathsfbf{\\Beta}", "Beta"],
         "\uD758":["\\mathsfbf{\\Gamma}", "Gamma"],
         "\uD759":["\\mathsfbf{\\Delta}", "Delta"],
         "\uD75A":["\\mathsfbf{\\Epsilon}", "Epsilon"],
         "\uD75B":["\\mathsfbf{\\Zeta}", "Zeta"],
         "\uD75C":["\\mathsfbf{\\Eta}", "Eta"],
         "\uD75D":["\\mathsfbf{\\Theta}", "Theta"],
         "\uD75E":["\\mathsfbf{\\Iota}", "Iota"],
         "\uD75F":["\\mathsfbf{\\Kappa}", "Kappa"],
         "\uD760":["\\mathsfbf{\\Lambda}", "Lambda"],
         "\uD763":["\\mathsfbf{\\Xi}", "Xi"],
         "\uD765":["\\mathsfbf{\\Pi}", "Pi"],
         "\uD766":["\\mathsfbf{\\Rho}", "Rho"],
         "\uD767":["\\mathsfbf{\\vartheta}", "theta"],
         "\uD768":["\\mathsfbf{\\Sigma}", "Sigma"],
         "\uD769":["\\mathsfbf{\\Tau}", "Tau"],
         "\uD76A":["\\mathsfbf{\\Upsilon}", "Upsilon"],
         "\uD76B":["\\mathsfbf{\\Phi}", "Phi"],
         "\uD76C":["\\mathsfbf{\\Chi}", "Chi"],
         "\uD76D":["\\mathsfbf{\\Psi}", "Psi"],
         "\uD76E":["\\mathsfbf{\\Omega}", "Omega"],
         "\uD76F":["\\mathsfbf{\\nabla}", ""],
         "\uD770":["\\mathsfbf{\\Alpha}", "Alpha"],
         "\uD771":["\\mathsfbf{\\Beta}", "Beta"],
         "\uD772":["\\mathsfbf{\\Gamma}", "Gamma"],
         "\uD773":["\\mathsfbf{\\Delta}", "Delta"],
         "\uD774":["\\mathsfbf{\\Epsilon}", "Epsilon"],
         "\uD775":["\\mathsfbf{\\Zeta}", "Zeta"],
         "\uD776":["\\mathsfbf{\\Eta}", "Eta"],
         "\uD777":["\\mathsfbf{\\Theta}", "Theta"],
         "\uD778":["\\mathsfbf{\\Iota}", "Iota"],
         "\uD779":["\\mathsfbf{\\Kappa}", "Kappa"],
         "\uD77A":["\\mathsfbf{\\Lambda}", "Lambda"],
         "\uD77D":["\\mathsfbf{\\Xi}", "Xi"],
         "\uD77F":["\\mathsfbf{\\Pi}", "Pi"],
         "\uD780":["\\mathsfbf{\\Rho}", "Rho"],
         "\uD781":["\\mathsfbf{\\varsigma}", "sigma"],
         "\uD782":["\\mathsfbf{\\Sigma}", "Sigma"],
         "\uD783":["\\mathsfbf{\\Tau}", "Tau"],
         "\uD784":["\\mathsfbf{\\Upsilon}", "Upsilon"],
         "\uD785":["\\mathsfbf{\\Phi}", "Phi"],
         "\uD786":["\\mathsfbf{\\Chi}", "Chi"],
         "\uD787":["\\mathsfbf{\\Psi}", "Psi"],
         "\uD788":["\\mathsfbf{\\Omega}", "Omega"],
         "\uD789":["\\partial ", ""],
         "\uD78A":["\\in", ""],
         "\uD78B":["\\mathsfbf{\\vartheta}", "theta"],
         "\uD78C":["\\mathsfbf{\\varkappa}", "kappa"],
         "\uD78D":["\\mathsfbf{\\phi}", "phi"],
         "\uD78E":["\\mathsfbf{\\varrho}", "rho"],
         "\uD78F":["\\mathsfbf{\\varpi}", "pi"],
         "\uD790":["\\mathsfbfsl{\\Alpha}", "Alpha"],
         "\uD791":["\\mathsfbfsl{\\Beta}", "Beta"],
         "\uD792":["\\mathsfbfsl{\\Gamma}", "Gamma"],
         "\uD793":["\\mathsfbfsl{\\Delta}", "Delta"],
         "\uD794":["\\mathsfbfsl{\\Epsilon}", "Epsilon"],
         "\uD795":["\\mathsfbfsl{\\Zeta}", "Zeta"],
         "\uD796":["\\mathsfbfsl{\\Eta}", "Eta"],
         "\uD797":["\\mathsfbfsl{\\vartheta}", "theta"],
         "\uD798":["\\mathsfbfsl{\\Iota}", "Iota"],
         "\uD799":["\\mathsfbfsl{\\Kappa}", "Kappa"],
         "\uD79A":["\\mathsfbfsl{\\Lambda}", "Lambda"],
         "\uD79D":["\\mathsfbfsl{\\Xi}", "Xi"],
         "\uD79F":["\\mathsfbfsl{\\Pi}", "Pi"],
         "\uD7A0":["\\mathsfbfsl{\\Rho}", "Rho"],
         "\uD7A1":["\\mathsfbfsl{\\vartheta}", "theta"],
         "\uD7A2":["\\mathsfbfsl{\\Sigma}", "Sigma"],
         "\uD7A3":["\\mathsfbfsl{\\Tau}", "Tau"],
         "\uD7A4":["\\mathsfbfsl{\\Upsilon}", "Upsilon"],
         "\uD7A5":["\\mathsfbfsl{\\Phi}", "Phi"],
         "\uD7A6":["\\mathsfbfsl{\\Chi}", "Chi"],
         "\uD7A7":["\\mathsfbfsl{\\Psi}", "Psi"],
         "\uD7A8":["\\mathsfbfsl{\\Omega}", "Omega"],
         "\uD7A9":["\\mathsfbfsl{\\nabla}", ""],
         "\uD7AA":["\\mathsfbfsl{\\Alpha}", "Alpha"],
         "\uD7AB":["\\mathsfbfsl{\\Beta}", "Beta"],
         "\uD7AC":["\\mathsfbfsl{\\Gamma}", "Gamma"],
         "\uD7AD":["\\mathsfbfsl{\\Delta}", "Delta"],
         "\uD7AE":["\\mathsfbfsl{\\Epsilon}", "Epsilon"],
         "\uD7AF":["\\mathsfbfsl{\\Zeta}", "Zeta"],
         "\uD7B0":["\\mathsfbfsl{\\Eta}", "Eta"],
         "\uD7B1":["\\mathsfbfsl{\\vartheta}", "theta"],
         "\uD7B2":["\\mathsfbfsl{\\Iota}", "Iota"],
         "\uD7B3":["\\mathsfbfsl{\\Kappa}", "Kappa"],
         "\uD7B4":["\\mathsfbfsl{\\Lambda}", "Lambda"],
         "\uD7B7":["\\mathsfbfsl{\\Xi}", "Xi"],
         "\uD7B9":["\\mathsfbfsl{\\Pi}", "Pi"],
         "\uD7BA":["\\mathsfbfsl{\\Rho}", "Rho"],
         "\uD7BB":["\\mathsfbfsl{\\varsigma}", "sigma"],
         "\uD7BC":["\\mathsfbfsl{\\Sigma}", "Sigma"],
         "\uD7BD":["\\mathsfbfsl{\\Tau}", "Tau"],
         "\uD7BE":["\\mathsfbfsl{\\Upsilon}", "Upsilon"],
         "\uD7BF":["\\mathsfbfsl{\\Phi}", "Phi"],
         "\uD7C0":["\\mathsfbfsl{\\Chi}", "Chi"],
         "\uD7C1":["\\mathsfbfsl{\\Psi}", "Psi"],
         "\uD7C2":["\\mathsfbfsl{\\Omega}", "Omega"],
         "\uD7C3":["\\partial ", ""],
         "\uD7C4":["\\in", ""],
         "\uD7C5":["\\mathsfbfsl{\\vartheta}", "theta"],
         "\uD7C6":["\\mathsfbfsl{\\varkappa}", "kappa"],
         "\uD7C7":["\\mathsfbfsl{\\phi}", "phi"],
         "\uD7C8":["\\mathsfbfsl{\\varrho}", "rho"],
         "\uD7C9":["\\mathsfbfsl{\\varpi}", "pi"],
         "\uD7CE":["\\mathbf{0}", "0"],
         "\uD7CF":["\\mathbf{1}", "1"],
         "\uD7D0":["\\mathbf{2}", "2"],
         "\uD7D1":["\\mathbf{3}", "3"],
         "\uD7D2":["\\mathbf{4}", "4"],
         "\uD7D3":["\\mathbf{5}", "5"],
         "\uD7D4":["\\mathbf{6}", "6"],
         "\uD7D5":["\\mathbf{7}", "7"],
         "\uD7D6":["\\mathbf{8}", "8"],
         "\uD7D7":["\\mathbf{9}", "9"],
         "\uD7D8":["\\mathbb{0}", "0"],
         "\uD7D9":["\\mathbb{1}", "1"],
         "\uD7DA":["\\mathbb{2}", "2"],
         "\uD7DB":["\\mathbb{3}", "3"],
         "\uD7DC":["\\mathbb{4}", "4"],
         "\uD7DD":["\\mathbb{5}", "5"],
         "\uD7DE":["\\mathbb{6}", "6"],
         "\uD7DF":["\\mathbb{7}", "7"],
         "\uD7E0":["\\mathbb{8}", "8"],
         "\uD7E1":["\\mathbb{9}", "9"],
         "\uD7E2":["\\mathsf{0}", "0"],
         "\uD7E3":["\\mathsf{1}", "1"],
         "\uD7E4":["\\mathsf{2}", "2"],
         "\uD7E5":["\\mathsf{3}", "3"],
         "\uD7E6":["\\mathsf{4}", "4"],
         "\uD7E7":["\\mathsf{5}", "5"],
         "\uD7E8":["\\mathsf{6}", "6"],
         "\uD7E9":["\\mathsf{7}", "7"],
         "\uD7EA":["\\mathsf{8}", "8"],
         "\uD7EB":["\\mathsf{9}", "9"],
         "\uD7EC":["\\mathsfbf{0}", "0"],
         "\uD7ED":["\\mathsfbf{1}", "1"],
         "\uD7EE":["\\mathsfbf{2}", "2"],
         "\uD7EF":["\\mathsfbf{3}", "3"],
         "\uD7F0":["\\mathsfbf{4}", "4"],
         "\uD7F1":["\\mathsfbf{5}", "5"],
         "\uD7F2":["\\mathsfbf{6}", "6"],
         "\uD7F3":["\\mathsfbf{7}", "7"],
         "\uD7F4":["\\mathsfbf{8}", "8"],
         "\uD7F5":["\\mathsfbf{9}", "9"],
         "\uD7F6":["\\mathtt{0}", "0"],
         "\uD7F7":["\\mathtt{1}", "1"],
         "\uD7F8":["\\mathtt{2}", "2"],
         "\uD7F9":["\\mathtt{3}", "3"],
         "\uD7FA":["\\mathtt{4}", "4"],
         "\uD7FB":["\\mathtt{5}", "5"],
         "\uD7FC":["\\mathtt{6}", "6"],
         "\uD7FD":["\\mathtt{7}", "7"],
         "\uD7FE":["\\mathtt{8}", "8"],
         "\uD7FF":["\\mathtt{9}", "9"]
        };

	return uniMap;
}
// /////////////////////////////////  END (UNICODEMAP) /////////////////////////////////////

// ////////////////////////////////////////// G E T  I C O N ///////////////////////////////////////////////
// Below is ugly code, the base64 rendition of the MenDBib logo that serves as the user button.
// I learned how to encode the png image by using the following websites:
// http://software.hixie.ch/utilities/cgi/data/data
// https://www.safaribooksonline.com/library/view/greasemonkey-hacks/0596101651/ch01s12.html
function getIcon() {
var iconImg =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASIAAAC0CAYAAAAw9iFcAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv' +
    '8YQUAAAAJcEhZcwAADsIAAA7CARUoSoAAAE9wSURBVHhe7X0HgBbF%2Bf4L17hCOeDoHenSBEVsYMcWLEnEEoWoscQk6F8lJrHFJE' +
    'iMNRowFjAW0F%2FsDWygEUV6P3o%2FuKMc3B0HXOX%2FPrP7fje3t7vffuXKd7cPvDezM7OzszPvPPvO7Ox8jY4zyIcPHz5qEY1N1' +
    '4cPHz5qDT4R%2BfDho9bhE5EPHz5qHf4ckQ8fHrF52x7ad%2BAQLViyloxuU06tWzanE7p3pIxWLdjtZCT0ETJ8IvLhwwU%2FLttA' +
    'n3y5kD7%2Fdint3X%2BQjpeXEx0vYyIqV%2F7j8Jcbx%2ByhkcMGUP%2B%2B3WnowN509hnDqXmzNDMnH27wiciHDwvyDx%2Bl52Z' +
    '8Rp98tZj2sgUEghGyEQJSZFQprIKMAuHsnjSoD429aBRddP4Z1LljO%2FMKPqzwiciHDxNFxaX01kc%2F0HP%2FmUP5BYeZTI7bE4' +
    'zmJ5swuJXTs8vkddLgvnTjuMvoikvPo6SkRPOqPgCfiHz4YHy3eAP9%2Bdn3aVf2AZNMTPLRCEUda2RjkIwzGYGAKDB8q3AzWreg3' +
    '%2FzqWppw3ZU%2BIZnwichHgwasoL%2B%2FOJve%2BmShSTQmYaBbBAgE4QgLRkaS3t6tNJxj94Qenemfj%2F%2BJhg8daJam4cIn' +
    'Ih8NFlt3HaBJ%2F3iP1m3azeTAwzAmCmYIkygM146M4FakqwirFKeOq8YFXDNdYkIcPXDf7XTbTdeapWqY8InIR4PEh1%2Bvpsdf%' +
    '2ForyDx%2BpRD4Bv0ZAATISIlFprWQk6eEa6SqGZcaxbToz7rYJV6ty%2FfWh%2F6fchgafiHw0ODz3xnx65d0fDXLQCUOsInUsZG' +
    'GmCRCHxLGYxGI3D2S4iDfS8R%2FzuHJ4RRhfg3HNTy%2Bh5554WPkbEnwi8tFgUFxSRpNf%2BoY%2BmrvGJACDeAyiATGAQCB2ZGS' +
    'SheU4QCh6fCDMdHV%2FpfMN4T%2BGy0D4xeefRS89P5mSkpJUWEOAT0Q%2BGgRAQvc%2B%2BTl9v2ybIgXV%2BRUBiF%2FIwgzn4w' +
    'AZCYEE4iXOJJNAGj3ePEdPVymtGRfwCxEZYRdfcBa9%2FtJTKqwhwP%2FWzEe9BggIMumpr2jByixq1DjOkEaNDWnMXYClUSMzTPm' +
    'NYyNcwrRzWBDHEVXCGzVqpFzEGdJI8%2BvpzLSB62lh7H76%2BTf02JNTzbuo%2F%2FAtIh%2F1FoqAnp2n%2FD%2Bs2KkNtwxh08' +
    'OwSmCR4FjzG%2BFwDYvFSKvHGVZMRZg1DVzE26cNhMkxC1A5bRm9%2FuKTdMmYc1RcfYZPRD7qJUBC9z%2F3PyagLHWMDs%2B9u6L' +
    'jQ%2B3R6dUxwg1%2FZTKyxIMsKoXbuUY6OSeUIZpRTj1NGSUlxNM3c96i3id0V%2FH1FWwv%2BvBRv6BI6Pkf6MfVe42hjxIeasnw' +
    'Rw3PMFTSh2OGX4ZpRloZdhnDJRWv0pjxKq3Ewa1IJ36VXknlIRqOK6fVRcIbU1FxCd18xyQ6VlRk3l39BNeIDx%2F1B8Ul5fTHqYt' +
    'o4dq9qsMbZCKEw66aH5JjEEKFX8JlbigwD6TO0VyTLBCH853ni9yF%2F3CJQVAaSaFLquOKuFVr19P0%2F7yN26u38IdmPuoNQEJ%' +
    '2FemExW0I5xtCHhcc4Ks4Y6mirpysNwZCuwh8YLikX4cYx%2FzGPxTXCA%2BmqxEGM%2BEpDtErxFf6KcuK4cjoM0ZYv%2BIzatmm' +
    't0tU3gIJ9%2BIh5gIQeeHEZLczMZcOCLQ7TehFLw7CGYInowyqxdJBGhmMyNNKHSMa5iDesH8NSqUinp7U%2FVucqMa2dwLGTmOlM' +
    'q%2BhYcTE9%2FfzLxs3WQ%2FAd%2B%2FAR%2B%2Fj7m5m0aN1B7sPc%2BfWhlAiOVRhcGzLizg63Yv5H8kCcjZjpKokiKcRr1wsI5' +
    '49%2F5nUq%2FMpX4a90XDmPGa%2F9l3L27jfvuH6Ba86Hj9jG47M20Lzl%2B7mzggA0ktFIBAQT6NQmAQXSKbcyefAfF1JxF%2F6j' +
    'znUW09qxjdNFT1e%2FrSK%2BQx8%2BYhf%2FmLWJPl%2B0T3XWCvIxCElJIIxV3YGMIIHwgBhp%2BU%2FA0lF%2BjRhEjPRWK0aO9' +
    'TCraGnkn36s%2FJyO%2F%2FGF1LXefPuDevkGjWvUh4%2FYQ3FpOf3hxbU0Z1GOOjY6tkk0GDaZ5FOJkPi4EhlJR0d6FQeCwbEZF8' +
    'jDReTcgJgEpYjDDDNJpCJc9%2BvnWgTd00yrrsX%2F8gsK6%2BUbNNytDx%2FVgpzc6nlyHz5aSvf8a7WaE6oEdNgA0ehkZBzrZIS' +
    'OXpHW7OimKBLA%2BVpYeIJ8ReziIXoaFvzTjrkQ%2FF8E3bURTX%2F9%2F9Tt1if4r%2B99RB2iUt%2BvyqU%2F%2F2c9lfNxu1ZJ' +
    'lJ6WSMP7tFBx%2Fbo2pcSExtSzQyqlJcerMC%2FILShWltDmrEIzxA7Yaxqvzc1X54B2XPnVuP5a3owzX5k7vYq3TaunD8RroudRX' +
    'mp7HqDiAunNtIHjCvno%2F16mM047WZ1TH%2BATkY%2BoAaokIscPT99AP1otFwsS4xtTv25NqXObZOqckUw9O6YaRMXhOmBh3TN1' +
    'NWXnHjND3FBBRuqIO3LFF%2FNGx68gJtPPLv8xjlUY3KppKuKChFuPg6RT5WR%2FuSIf7boBMpLzS%2BnKyy6gl6c%2Brs6pD%2FC' +
    'JyEdUADUq584DKS0tVa6o1q1PZdLeQ8XKHwpaNk2kzm2TFSklxDWi9%2F63Rw3LvMMgI%2BWTTqw6t7mAUZXRzjWl0jmVSaq8Ujrd' +
    'X5GmUriHY6OclcOcjrHF7Prlc6l5s6bqvFiHT0Q%2BIgZUCAICKi4upmPHjinBMVBU2ojufXk3HS02SKFmYVpnqhMLscBl4U6tVjx' +
    'XijOPdVJyi6sUbvg7ZDSjM4b3puGDulNGelPQIRUVFdPy1ZtpV%2FZ%2B%2Bub75bR3X24gfbl5bkU5zbxEHI6ff%2BIRuvbqy9V5' +
    'sQ6fiHxEDKhQWVmZIqHCwkLKy8ujQ4cO0ZEjRxQZxcXFUUFxEj3%2FRRmVGv2t5qHIEh3YhmB0vxnHf7Q401X%2BinDdKurWMZ1%2' +
    'BNuYkOmdkX%2BrYNt28qDM%2B%2BmIBTZ3xIa1Zt8XM3yBtyc%2B4jjkkU8cVhCVy8YWj6I2Xn1HnxTp8IvIRMYSIYAWBgPbu3Ut7' +
    '9uyhffv2KWJCfEJCAhU3SqePN3bkDmWeWMNA5%2BYebHZsjWj0YyEXPb4SEYmf403%2FT84eQH%2B8fQwlJXqfdBf8a8YH9NS0t%2' +
    'BlYkTHvFbhO4FrmfJEKY79WFgzPtmXOpyb1YEvZyrOBPnxECJBOSUkJHT58WBHR1q1bac2aNbRs2TLatGY%2BndB4EV5I1wrwutx4' +
    'NQ%2FRXonLuiEl1tfqcmwVI%2F7nFw2lP%2F%2Fu0rBICLhj%2FFj64NW%2FUvOmaUo410DeBqSs7FVhIvhNthL67vtFyh%2Fr4Lv' +
    '04SNyoONgCAbLp0mTJpSYmKhICRZRdnY2bd68mVavXk2bV8ymlJz3za5U8zA6uZVQhJyk06N02jFKGwiv8P%2FmurPoD7degGwjQv' +
    '8%2B3eitFx9R0qxZGocY%2BQfKp0IqX1uVjY8%2FnTOX3dgH7saHj4hgdOZGFB8fT8nJydyZmlGrVq2UNG3alA2OxoqQcnJyaNu2b' +
    'bRp%2BWdUsPIF1bVqHtLBg4lxT4ZUjktKTKCHf30BTbgyeut4BjAZQZ6fcrdBNEI8AI6lLPJPhRF9OW%2B%2BkSbG4RORj6gAHQOE' +
    'g5%2FAARG1adOGOnXqpKRt27aKkJAGE9j79%2B%2Bnras%2Bp6wFz5pn1zBUJzYtHi5z4Fj57cQgAvFfe%2FEQumx0PzOz6GL0aUP' +
    'p6rHn8mVwPQ6Aq7qplMEUFdKIdu7aQ4uWrFDHsQzcoQ8fEUOISKyili1bUseOHalHjx7Us2dP6tKlC7Vu3VrFYch29OhR2rHyU9o%' +
    '2B%2F19mDjULlFcJd4GABST%2FAnG630zDaTdsP2DmUj146N5fUkbrdPP6uK5RXlCPIXBMkmR8VQ%2BsoriHGabfh4%2BIIJ0WhCS' +
    'khHkj%2BOXNGl7x63Jw9xoqOXKIWnY71cylpmB2aLXOSIQhwVXA8XwPcHdm57G3nIb172hERRlJSYkUHxdP8%2BYv5cvhTV%2FFtY' +
    'nMV458rN4CclheXj798hc%2FN8JjFD4R%2BYgqdDICCYGMhJCEjPBWDSQEF%2BuMDu1ZQ8VHDlLr7iPNXGoGhpWhQzo7YPoDBFD5e' +
    'MnaLNqzL59OG9KF7y36A4sBfXrQzHc%2Fp8IjR%2FlIuza86o9BQgjbu3cf3X7L9TH9Gt8nIh9Rh5ARxEpGAMgIBAQigh%2Bfg%2B' +
    'RlZ9LRvD2UccKZKk2NQicbOGYHrxwGyLERsGHbXvpqwUbq1LYZdW5vfMwbLcTHo97iaN53S8zrYX22XF%2BzkpRVRHT6qcOoR%2Fc' +
    'uyh%2BL8InIR7VAiEiGaBC82ncjo%2FycDXR43yZq2%2FscZKDSVTdQxsowO7jymq4ZBotO%2BVWQEXao4Ch9%2Bm0mbcvKpaH9Ol' +
    'BKk0QjPgoY0Kc7zXzvC8MqUtczCKiiHFKWcurXpyeNPOUk4zgG4RORj2qDTkYgIBCRWEYIlw9kdTIq2L%2BV8rPXUbu%2B59UYGSl' +
    'U6tx6J7cey5%2BKoRGIYdOOffTeFyvUaudBfTogUcSARYS6Mqwi0wqSa6tLm2EsrVq2oLGXnK%2FOi0X4ROSjWiFkhA4F0S0jJzI6' +
    'nLujRsnIuAQ6NBz1p5JUtkBYAqQASNhxKi4upflLNysZ2q8TpTdLMZJEgBP79qDpMz9SH83KdSoJhx1nYiotLaFbJlyjzolF%2BK%' +
    '2FvffjwUevwLSIf1Q7dKrLOF%2BlWkQiOCw%2FupNwdS6h9%2FzEqTfVC8oeFAcewNAyY%2FkoWiBmnDY0QLpKzv4BmfryQitjKG9' +
    'q%2FC8VH8FYNw7P9B%2FJoyYq1ZvZ8zcC1Kq5%2F4MBBmnjnL1XdOgGWnZMIqr%2Bu7eETkY8aQThkdDQ%2Fm%2FZu%2FJY6DLyE0' +
    'xiT3NUFo%2FsZHRz%2FDK8N0agwM449Kq0KN0XBiFu2Zjt98d1qOuuU3tQsLdmICgP9eXg2482PeOhaalxPXUsrmyoL0dhLzrP9JV' +
    'ghG6ljDIHxUTJcfBcobYMlFQjH6ngc1yT8oZmPGoNMWkP5mzdvrj796N69O%2FXu3Zv69u2rVmF36NCB0tPTKSUlRZHVkdyttPC18' +
    'VRW4mV72AigOp4hlVYzi5hxxormivTqH%2FtFDBhxY88bQn%2Bf9DNP%2BxO5oU3rdDr7THzXhqsZuau%2FuJ4IY9XqdcrVAQIC4Y' +
    'Bk8HmNyB133EGDBg0KlBvSrl07uuaaaygzM1OdV5NwtIi8FqSi8msWdb18DRXB2kXaQ1%2FwqL%2FWl44jT248xYuOHKKs1R9Tp4F' +
    'jqXFcgkoXfaDchuWg9iJS98FSbro4NuOUX8ICcQg34i47ZyA9%2FYeraOy5g6l1Or6mjxydOrSlN%2F%2F7mXEtXNPmzVmXzu3pvL' +
    'PPUOkFqD%2B8CAD5YMM63Ne8efMI3R57R%2BnAflKbNm1S3wmOGjWqRvtOlY3RjIaoMOUAFMhaKP3YLS7a0MsGF7ArH2ANr85yNXT' +
    'YtQvIxglIB6KB8ufn56vN1PBl%2FoYNG5RgH6Pdu3dTbm6u6kToTI0TUui08W9SQkpkFkZlGOXmP8wjZdS3SwqdPiiD%2BndrocLM' +
    'FKbfTBc4hnOctmUdoAMHj7Dl04xOH9qVh2FNVDiAOoiW3p1y%2Fg20Y2cWlxMbpVl3byylc0eNpP%2B%2BPtVMbUAsoYMHD9KBAwc' +
    'oNTWVVq5cSePGjTNTVAVI6sEHH6zR%2FlKJiKAcEBmnU1ERJfCN5H%2F3HR1Zu9ZMVRVJ3bpR2uDByp%2Fcsydqn%2BL4hqMJFBOi' +
    'PynjWIkbsRxZv57y%2F%2Fc%2FM2VVNOaytLr0Ukpk0xOIbxHdVbANFaI60i4i8RRHpUUltOLrpVRUzG3Fw5njjeKonPXCcFk4rJw' +
    'VvZSzOMbnHDl6lA7mH6R9%2B%2FZQ%2FPFc2rJlE%2B3YsY325uyh%2FLyDqjOhUzVii%2Bi08bMoMa3qXEioEGsCnRod%2BapRne' +
    'mc4R3phzUHKXN7gZnKgLKSyopZ94rZ5fRlJVRWCn8xdW3XlNKbJQXIoV3rNOrXswN179KGjw3iSm4S%2BbzL3556hZ594U2DfJRU7' +
    'NiI8mMIt35Z5f2JQPSwhED02IalBes%2BrB4MwZwAInrggQdUeWuKjAJEJE%2BoIiYffBkNfxqbbsuGDqVyvhmvaMzj%2F3bjx1O3' +
    'Rx%2BlhNaRKwuAIqJ8eCqiYiEtWKk333or7X%2F%2FfTNVcLS%2F5Rbl9pgyheLTo%2FlUbZhAmwBoF%2BgMJCEunjLnLKYvXvqEy' +
    'thfGpeo3LLGpsvHpfEJfMzCpFLaOJ5KmJiwY%2FOxch5CFBXS4SO5VJCfQ4fzdtMRlqLC%2FVReXEBlJdDLUmrE5wy%2FehqlZZyg' +
    'rh8eQEDcgUEoJceoTfM4euKus%2Bj2J1eqX5G1QqUtLWLyOcYuExL8fB7CjHDN5XA5btm8CZ1%2F5mC65opzqGuntpSWmhJ25%2F5' +
    '%2B4Uq68ob%2FV4mAdMsIZJS9ZXGlb87EGsLWvRDsgLB9%2B%2FagRPSnP%2F0pqtZcMCjbWTo6SKigoEDtF3Ocnz45L7wQEgkBSL' +
    '972jRaf9NNVMJmdaSQsuFpiBl9mOqw0rb%2F8Y8hkRCw58UXlYAsTf71ESZQf3hYQUBA8tQtLymjrLVbzVTBYTx1G6u5n3geeiXxs' +
    'CulKXfYFp0pNb0LpaR3pqS0DGqc2AxPOaaPOO7kJbTwjZvo0M7FZi6hwrCu0XHLio9SybE86pB%2BnLIPHLUloUiw70Aevf7fL2jM' +
    '1XfTJeMm0uLla5kY8szY0HBivx6GpxI5VPi5Jmnjpqp1L0YGBP66qPsBIkIhxYwDEcXz8ZF1VWfhveLAhx9SCStmpDeN82Hug9kxu' +
    'QYywovQ7JdeMhKEgWPbtpk%2BH%2BFC2gUCIkLbqAcYhx87jC%2FGvUMno4TEZCajFpTcrC0TEZNRy65MRl2oCZNTQnILik9M4Sd1' +
    'AlNJI1ryzj2Us%2B4LM5cQoYZaXP6SI0xEBdQipREdLCgxI6sHm7bspEvH%2FYb%2B9sS%2FKTcMMmrWNI169exsHtmTEeaQdEj%2' +
    'Fi7QfVjcCRASFAhHBIgIZAaFaQ1bs5CFQGRNHuEC5xFIDAcHEbJaYSLufjWxnv7II78uH0TbylEX7YCtY6A7aKxwEyIhJJj4hmRKZ' +
    'dEBGsIgMMupETfgYZBQHMuJhHs5ZM%2BdvtH3xm2Yu3oCyY8IXw7LyEgyxjrK%2FGHaSmaJ6MePN9%2BgPj%2FyDyTvfDPGOYYP7V' +
    '6KgAGAlsWywsYhiAZUsIgx%2FZA4GYZFi76xZqtLCzQvnyRMXb1ag6G14jLvvjTfMFOEjGvfXUIG6gwgRoY2gO5BI6lWRUWNzmMZk' +
    'k5icTslN2xlk1Kq7soySm7WjRB6%2BxSemqrkiYPP3L9Ombyu%2FLQoGfsSZ8ypMRkxIIKaaxNvvfkqLlq6k4pLQrLCRJw9SrkFGJ' +
    'iWBhExg69hYRGNRHFEsKBVcL2jSrZvpswcsqtw5c8yj0IDy4OkqE6GwiPDq8fCSJVScnW2mqgy8DcP8j4%2BaAdpI2knEC1JSk6jP' +
    'gI7Ut38H6tevPfXv25alDQ3ok0EJCXEGGTHJxPEwLYGHabCEUlp0orRW3SiFraPk5u2ZjFpSfFIak5ax7cbOle9R5hdTuDwhEAqGZ' +
    'yizOic4gbZslkj%2FuHM4PXfP6TR10mh64Y8X0r8fvJRe%2BvOVNPWhq%2Bj2a0fR4L4ydAqOO%2B%2F%2BEz%2F0i8wjbzjtFLyd' +
    'riCeChIyXOvQLFYQsIhEocTvBSO2bqWUvn3NI3vsfv55KrUsnPIClAGECLMf80OQbmwN5Tz9tJmiKnpOn06dJk40j3xUJ3QdCUVng' +
    'KtuOJNu%2Bs3ZdN344XT9DUPoxl8MognX9Kebx%2FWmN5%2B6iD58%2FhKa%2BdhZ9MAvB9CFp3aljh3aKjJKZjKSOSOQUVIqyChV' +
    'WVBcAPU5yKqPH2Re8fD7%2BFxco8QBT1B0aZtKHVsl0MqFX9DKRV%2BZ8jWtWPg1bV7zIw3sGk9%2Fu%2Fsn9J8nb6Mh%2FbubZzk' +
    'jZ%2B9%2Byly3IaS669yxLQ0b0l8RkGYIBRDTRKQjlEoBMq691vTZ49C8edgFK%2BR8kV4nIpBki%2FR0yp0920xRGbCGMi65xLeI' +
    'YgAJifG0ceN6%2Bm7%2BNzQf8t08%2Bu67ufS%2Fb7%2BmWbNm0quvvkqfffIBP8A20GXDE%2BnJOwbRzWP7U8uMDuYwrZuS5OYdK' +
    'DG1tWkZJbDOlFHentW09J27WOcKzatFF0fZyscPRkLwO20rVqygpUuX0vffz6dXZ8ygvz%2F2F1q3aiFNvu9q6tcruHU0%2FbW36H' +
    'BhaGW9YdyldPqIISwn0RmnDlPSqydGJ43omNouJPZQhYhCRZubbzZ9zsh57TU6zkM%2BrwAJgXgw54BhGYiofZs2lM0WjxNaX345x' +
    'SVU1%2FJ%2FZ6CsTlKXYFc%2BSG0AT3L8vBA%2BJYBkZGSo9S345Q8suMPPEWENC9a9LF70A335%2BSfUs2UhPXf3COp9AiyizmqI' +
    'ltqSh2otOrBlZJIRD%2BfwJqyoYB%2Bt%2FvQRSj4e%2BfIRKxITEtWvkkDwbVy3bt2oc%2BfO6j7w%2FRzqdO7XX9HXX82hx%2F9' +
    '4o%2FoNNDfs2LmLykqNB7XX9rj6igvp3deepvfeeJbef%2FM5%2BmDWVPpx7jt0cNdyWvljeFMhXiBltEo0EDERHWGLpdmp7r%2FA' +
    'sOff%2F6ZyJhSvhUY6WENCRJCu7drRXpdX9hm3364%2BCahuoGwgSX0%2BTUQf2ko6%2FThc6PnJteV6cg0r7NKLSH6SRvw1BUxK4' +
    '8NWdGD57TP89BAEH73i40uQE9KAsPAt2qaN6%2BiH776iSdf2pd49u6g5o9RWJhmld1RrjeKbNKVGcfHqDVhh3n46tPIlapu4R0m0' +
    'gC%2FTTzzxRCUDBw5ULj7YBTGh3CAjpFm2dIla1DhqpDG57ITtO7Jct%2B6oTYh%2BQHRdF7%2BuQ5HqUcREtDU7m1r%2B9KfmkT2' +
    'wHqk4y9vYVW4GN4u3d7CG8FtYZTk5juua8OlGSp8%2B6glaHZDKlkaQN0RqGQCTJMp2dNUqymHC3fnoowE58M47VMime%2BmBA1RW' +
    'UMCjhcKQG0qujUl7XBNuWV4e3jIoq0F9z4VyHToUqDu9rKhDuOX5%2BaqchYsWVSpj1pNP0eEVK%2Bk4P1BK8gtCLl84ABHJjzDiC' +
    '3wIOjGkffv2ioyEkGApwUrC1%2FjA0oX%2FYzLqo8gouXlHNWeU2hJv1DpTk6Zt2DJiMsInJEwC6zdnUcrBr5QMbJ2jrusG91gDIE' +
    'WxiE444QS1c0Af1j34YR2hvHipoh6iRwo8Dc8Aabu6ApRF1yHoHd5cQ9AnV7G%2BP8r6I%2FLkk0%2BqYSq%2BZ8OaslDvJWIi2rJ' +
    '9e9B5IiD7lVeojG%2FAC1ABYg3hpjvhlf1U59ezbW%2B6iTZs2hRU0cIBKhQdWyfGciaV42x97XrgAVoyaBAt4Cf60pNOoo133EHb' +
    'Hn44IGt%2F%2FnNaMnQofc9P92UjRtCWe%2B6hom3bqJQb00tDiTLIOh28OWzE52ZedRV9x5bCN3y%2FEPjXXHEFlebmBkgLZUX9N' +
    'eby5n34Ia255BJVzuWnnVapjJvvu48WDj%2BFvm7Xidb8diIVbtxEpQXhr%2F3yhkbqt%2FHRYUXS0tIUOYF08FPVsIiEnOBHOB5I' +
    'aOP1a5bSfdcNoLTmGZTcgsmILSP1Rk0tfDTIiBNyHRyhtRt2KWl6bCVdPvAgJcbb60i3tt6%2BBWsc1zhQTikriFSsOpAr7geEdfD' +
    'gIerUvpV5pj2wf1BJaYlq61A7b3UCeiSjEej8V199RZewDkFw3yexvuNTEJF7772XhrKuo63w%2Bcinn35a5et%2BN0RMROggMjxz' +
    'G6LlvP66p0lrvfOhAuB25Kcj1iQ5ofUNN9DWXbvMo%2BhBCAhlAAkUMwE1Yf%2FWX%2F2KFvETcNfTT3tepQ1rDp%2B%2B%2FNijB' +
    '2289VYqNVchuwHXByGjjvFpC5Ti4NdfqxcA%2BmJT%2BBF2bMcOlR7rrUq5vPF8jczLLqNMJsT8BQvM1PZQn%2Bb837s0d%2FjptP' +
    'YvU%2BjYvv1mTPSB%2Fg5LDlt%2F6FuBQDCsAeGAmDDMEVKCpYFj7GWE%2Bzt8KIeuH9OLElNbUXKzDsacESaxWxqrsBUZMeFlZec' +
    'q2ZOdQ3HHdtFdY8qpbXrloVD%2FtgXUOcPbb4LhMwq9rCgPrDUMITHHBZKSvZSwEnrfAfdFi127dDJ9lYE%2BIPoB3dvF%2Bv3WW2' +
    '8psnSSRx55pJJOQX%2FChegdRhmXsQ5BFrAOQYJh9uzZdOmllypCgoUUTM%2BBiIkIirSeh11tbrlFiROw9ufImjXmkT1QYHmiCxN' +
    'DCfGmzGkJAJYPNGYFxWpwNEY0YC0H8j7Oyn%2BMnwoL%2BOkX6jduVoBUF7JJjzVRGK5ZgetDhJBhDuPzCVWOII0KpY3jejvIpLeY' +
    'yTIYAdlhywuv0LKJv69WMhLoHUmGmhB0ZHR0EBKewOjkmDPCMayprZvX00WndeROz8ep6ep1vhqmYeFjgIxS6fDRUiWFhwto3759V' +
    'Jh%2FgO77SQqNOtH4%2BPScfsXUoVloa3mkvOJHeYWcQEzoE3DTmragzI07VTonDBk0gFKYeHWgjeUa6ANr16711PbRBO4JbwNh5X' +
    'ghHzuAkIYPH047d%2B4MWvaIiQgKs4OfxHhrBXFD1rPPUhl3KidI55NhGaQLK%2BDeF14wU1RF25tvph179wY21ooUKINYIrg%2Bz' +
    'MskkMF%2F%2FkMbrr%2FeTBU5QKzLzzyTChYvpnK%2Blg6UQS8HnkxQRCilW3MifSq3x96%2F%2FY128NMxEuye%2FSXLV1TOFmFN' +
    'Qzo32hSdGxYGLA1YRLA80MnxkDjEVuIZg9upTz6wChvkg%2BEZhmmGZdSGGiemKik4UqJIGp8Jgdh%2FcnIT%2Bt3FTahDc%2FvJ%' +
    '2FnAheXXt2o2tudb0%2BTdL1LEd8JX89eOuUla3EA%2BAPOCHi04sbe8FOCfS%2B1m%2BfDk999xzyqrBED8SYI%2BpsWPHKsvIDR' +
    'ETEZ5OeGof4gaGtBg92oypClgSjbnynSoK4fpcDBojjZ8Wai2SA9owOeSwtQDFjQZQBrGE1BiXifHYN9%2FQjgcfNFO4I23IEFUHX' +
    'vY8wnAoc9w4NbdjBxCLDA0hIGk3lPATf%2Bf991O2C3GHgsynp1FZUWSfbUQCISQ87DBcAwnBIoIfYbt2bKbzh7dWq6vjEpIpIZmH' +
    'bkw%2B6o0arCPMGaVlKDlSmkRlXJ%2FQKwjqMyUxvE6Lc%2BQ8tBEEOoM8obuYI7rksrH0h7%2B%2FTkXFzp9w4Od%2Fyo%2BXq3v' +
    'UiQiAH%2BUEaSJP6IEXRKOt3ud%2BOmnSJPMocoDYpkyZoh6oToi498J8hlJs4qEXpPUvfmHGVAU63oGPPzaPKgMVKA0q1lAHHgbl' +
    'vPiimaIq0OGLuIFgNeiNGC6k46Ph8RTCE7Qlh22%2B7TYzhT1APgOYrM5gRezx0UfU7qWX6BQe05%2FGw7mO991nprIHhqwbb7%2F' +
    'dcegpig4SguumaGsuuihqJAQU7syi3OWrzKPagZARLCMQEDo5XDwAodjtW5mbv8fFG2TUpBklMRlhEhtDNLXmiKVxk1Z8bjNlZaGN' +
    'oWfBiN0OqH85H3onljPKgvbp3KUrXXHV1fTsjM%2Fp2wWrzbOqokunDnTz%2BHHqTZ2TNY%2B8vbZ9XQcsLBC10z1ETEQwk0FE2No' +
    'T0uqKK1xXNzt98oECosJRWCGiru3bU84rr5gpqqLNjTdSHp%2BDhoyUiHB9NDauLyZ8Rx4KbOahnz4xbEWrq66irm%2B9Rav53Hf4' +
    'SfIpE9Kc%2BfPp9bffplnvvUfFP%2F0p9fngA9c6gaWIBZ%2FWRpJjp8bzCnwT2OOf%2F6SBP%2F6oBH43y1XHsoemUEnB4YjLEAl' +
    '0MoK%2BQeCHxZDRAvMrhjWB1%2FaN4%2FnBmJRGSZjEbo6V2CCjLpTUrCO1Nzfmx8MzHAsac03NmzZR54MIISgLho0tW7fh4UELOn' +
    'gkgX7262fpk6%2BXmmdVRedO7entV58h7PCI%2BxD91XUYfQGEV5v1ruPUU0%2Bl91ifIVivh3LBfZ77M%2BbwggEP98mTJ6s2s0N' +
    'UiAgNgoqD5PLwwE3JMcxqxBWvVzD8IAGxRlBYmODHNm92fCuFjt36yivVGxQxbSMByoCnHK4Nawj%2BeCZDt2FhyzFjqP0TT9AKHs' +
    'cjPZQcb3nQMHhyI88Fq1bRZia0XkxWbsh65hkqd3lihIsu3Pj9v%2F%2BeskeMoIU8BPyRx%2BpZw4crq63Nr35lpnLGwTXrqBS%2' +
    'FvV6LECJChxUCQAeGvsCkSEvGW7AKMoozyQgfxmLeCJLYrINa54PlALLoMFQy2rSrgEbd%2FhGdecs7dNqEN2nE9a%2FQyeOm0rCf' +
    'Pk0jr36SrrnrZZr411m0P7fyNrMCvEX7%2Fe8m0Ox3XqDCw3nKskM57HQX%2BoR7rG2gf7%2FND1W8scObS8gPP%2FxA06dPp2%2B' +
    '%2F%2FZYGDx5MX3%2F9tScyev3119W92ul4xESEiURUJpQEguFZqxtuMGPtkf3yy1U%2B%2BQARiZkLMujCN5zz1FNmbFWABI5xOq' +
    'V8Ng0ZClAxYo3BGgIRdWFC2RFknNz92WdpN4%2Fh8WZPXxmMtSR4ywMyhTKt27SJWowaFdgz2w5qeYOlTiIBiLrvhx9S0YUX0rzFi' +
    '9XrX5A2LL1169bRx0ywyXfeSRnXXWee4Yz8zXVjIznoF6xvEBFcEElefiG1bSmv3qELrNJqkzVOk5ii5o0glJROXbp0UQsm8bAACY' +
    'glUhM4aVAfWjL3Nfr52HNo9aqVar4LDyu5Dyugj%2BgLtQmQC9YPYY0UNtzHnCkE5UXZQZbr169XltFHH32kSMsN2cwN2Ka2WogID' +
    'SqmMgRv0EASbkMR6ycfOhGAhOBHZ3Z7TY5FjCWskNFQJlxfrDEQERQgnYnE6QNbAG8Iy8y3ObLwDiKrhPVFeFC25atXU6cHHjDPrg' +
    'pYfurXGbgsIuFCkdBnn9Hezp1pf2GhKgvKJWXCwwNtNZ%2BVq%2Fs%2FHndtKyB3Vc3%2FzpUV8sARMoKLDnGYybVdeuXyq98l4zh' +
    'stB%2BX0ERJYXEStWubEVjrI%2B1SU0S0Zv1WevTxl2j%2FwcM0fPgpbFlkqH6D%2B3CCsvhqCSjbJ598oggHdSSr3WXFO8hc3mBi' +
    'i2AYETNmzDDPdsabb76p0loRMRGhIGhUMZlBIvtychQZOQGL%2B%2FDZAwAFhzUEdpW5IZh%2F%2B3ks6jQ3gzdSsDDQUKGa11ZYr' +
    '49JR1gyeQsXus4NtWNroozvG8MxKDbOgcDsR5h8wClWUTYPWZufe655tj3wKj8a6MXWVT4TeWO%2BrlWBQEYyNME9441jxtifmGfa' +
    'o7aHZgIhIiEhHJeUFFNqsl1nrhiqQUopQW1crz84RXdqgoyKiorpP299QhdcdTuNvvRGmv7Gu2zNVfcK9vDx4osvKh1Gn4YVKQ9aE' +
    'TzYdKsfBsiFbH0HG6LhF0TsJq2jRkRQbAieMpv27KFWN95oprDH7n%2F9K%2FDtFchLhmWQrsy2e13elsEaQXpRxnAVSSpDJyJYZM' +
    '25cgtd5oaA1D59VCOJUuO%2BIfAjDE8SNJKQNCo%2FiUnADYeXOk9wegV%2BQSX%2BlFOoMV8XViVIHQqDJxj8cEFEsvp3N5vazc9' +
    'zJ8hj%2Bw5Q6dHo7NoZCaSt0e7S9u5AeqRrTO1aNqFiNjCkrSLVnUiAXRQfnfIcXTvhN7R%2Ff26t16sV41mHRo8erfQYDy7oDx6u' +
    'IjgWXcJDGOmArKwsGuNigAAYnqG%2FWRExEYF85CkjnRKLsFqdf76ryY85EZjPKJQ%2BSY2nXRI3jNuK4Pa%2F%2BQ2Vced2M2u9Q' +
    'idClAGE0Yo7qdv1cV9NeNwsCg0gH1EohKEu0EhoSDxR0IBJ3IBugJUYynYpdsAbsgS%2BLq4H0xmEg%2FaBCDkiHMcoP9appAwYYJ' +
    '5tjzKuE2MXw9qDEIaQhxw3Zh0o8fDLG2kpCepHW63nh4r%2B3dNpaJ8MOqlvWzqpX3sa1r8DDRvQiQb16WCm8I5FS1bQ0NPOV1uB6' +
    'PpT28CkPnRELHroihga0t8RDv3WdQlDtKuvvtrMxR5Y4Ii01nuNmIjEAkBhIHj6A1l8QbeV1lg%2Fgy%2FTAX1Y1gGT1C7WkHxpH6' +
    'lCCVAhICKUASQEQkrlCg72DVnuF19QSWam%2Bur%2ByMqVleTY6tVUtn49pezeTR35nvpznQznRt09c6Z5tj1QJxgORqqUoixoCxn' +
    'KQPS2QhooRKT1V9tITk6h3Pzg%2Bz6nNamq%2FKGif7fm9ORvT6H%2FN6433XvdAPr9DUPo%2Fgmn0B9vPo3%2B%2BtsLaOXHD9Ka' +
    '2X%2Bl1566na68yH1rHEFeXj7deuc9yoXUFVh1SKxQCI4Rjng83OBCt%2FAJzYgRI8wc7AGLCOmtiJiIoMw6EeEGUFA1PGMTzw3qk' +
    '4%2BCAkUAQkTdunShnJdfNlNUBVZSF3N6qZxIAeWUoRkE1lkKm5xuRASyWHXBBeqLezdZNmwYLR8%2BnFbyUGkVN9BGD7sURAOoGy' +
    'EZIRrxIw5KAwmFiNCHI%2B3I0YSUBd9p5RYE35WwZbMEvtcKyyocJCY0pl1Z2fTE3%2F%2Bm5B8sj0%2F5K02Z%2FBf666MP0Z133' +
    'kl33XUXrV46n8ZdPIT%2B9%2B5jdOpJ%2FcyznfG%2F736ghYsWK0FfqAsQHUIfs9YZjhEOMkJ%2Fhwt98tIfMepAP7Mi4p6MAgs7' +
    'QmR4hld6zbjzuX3qgLdi8ZxehmUYTuTxkMhpc3yg7YQJmJiKmIREkYWIYBWBhOzGr7EGUR47BRIlEiK3pqmrkPZC%2B0BwDD1LTWl' +
    'CO%2FcGn0xPTeZOFYVbTUhMUBu6yaZu%2BksA6D906Icfvqfn%2F%2FkMvfHaDHpw4s%2Fp1GH9zbOd8as7JiopK6sbK6jddEPXIb' +
    'SBWNfow5iGCAa7fcMiJiIUSCciCI6BXTt3ug7PYFngkw%2FcDG6iExPRvmnTzNiqwJf2idzwUhGRAg2uExFclP9INW2wFgyKtLlBo' +
    'wE3JdIllmBtK0yabtjpbTjTvV0KJbFFEymSEpOof%2F%2F%2BlQQ7NGJjtK5du6qOiLkV9IHMzLX04fvv0KP3jaeM1u4%2FcZ6Tg9' +
    '%2Bm38tEZuxNVBcQTD%2FQB0FA6L9iPXkB1ulZERUiQiHAijKuhFWEsM1sFbWCBeMCfMKRYipYerNmrmt32lx3HZXzTYOJo9mRdOW' +
    'uTSVog4WgfH81gVgmIVgdkFat29LSjfarmK04uU8LdX6k9w2CAfH069cvICCjAQMGKBeEBEsJ1j36wsaNG2hP1nb69YQrzBzcsXZt' +
    '%2BL%2BuXNNAXaL%2F6%2BIFeJtr7WeRPyIYKIAdEeXk5FDaoEGuwzMQD97sdO7Ykfa%2F%2B67r2p32t95K5ebNRwuoEF2wjigli' +
    'HmJt2a9Zs0KfLsViQxauJAGL1pEp7D12IgV2NpAPioAEsL8Al4ogFQ6delKsxfuM2Ptgc8%2FIK2ae9v4LBjiWK%2BxhgYC6wdDMx' +
    'APrCFsH9urVy%2Fq3r27isebJTw0MUHbq4f9BmhWrFi50vTFBoSAQEro99jALxhkxKQj4h4trAjigcjENUgJ2LZ9O7UZN075nYBtZ' +
    'Pvwk2Xvv%2F9thlQFdn88bt50NIlIIETkBSCitldeSYsPHQpblrB5uoJJbx0%2F2XczEWN5ZznXGepTxIcBtItYQyAhTOhiWLYpqz' +
    'DoRPXgns2VHC0qiYreoF3kgQvBQxSEg7VZWFsDcsKnPiAivN5G2qzdWTSgbw8zB3esWr2Gjh6NbA%2BgmoTeZ0AwWA4SDLAWrX0ta' +
    'haRHRHheKuX4dlLL9HOqVPp8PLlZkhVtL%2FtNirnRscTBoh2R9U7f%2BH%2B%2Fa6%2FYqs2qjefyugUoQg6EkTe0KFBcF00Isba' +
    '1UGysQ4hItQb3qyiHjt370Mvfxb8BxlO6t1cSRMe8UZDZ5CDTPRD4Ieeo%2B2g%2ByAldDQIXm2rNoVuGacHBQisSRPnPbvqElBGa' +
    'Ru4IF58e%2BYGzJ%2FhgWJti6hoPTJFg0DQoeRpgUbA8Azrftw%2B%2BMQnH1vuuMM8qgpYIC0vvdTwc%2BNHQ6EEyEsX4ChbKm7l' +
    'BYr27FFvTvRPKLyImPPih%2BLh6S7ff0Xz3uoDrCSEoXO7Dl3oi6V5tJktIjckxjemUUNaKUE%2BehtHG8gXugn9F4tJHsYdO3WmN' +
    'eu2mCndMeykoep%2BYwGoU33ODm8Og31vhvk1tKEVERORNKw8IeTJIA2BMKymDLaNrBuwrUg533S0SUggSgQXspctnmC%2F1XaUyR' +
    'NEEqoIAcn3OvLxoNSVlAHS0CEkBCXHEg%2FsHpCUnEZ7j6TSG18Gt4bGntGOjpeVKEHd1hRwLXkwox179OhOi1duMGPd0bdP71ono' +
    'qefftrxK3mB3jaw7nGf0Gns7uiGIUOGKHK2ImoWkQgqX38igJg27dxJGUF2OXRD%2B1%2F%2Fmo6zmSsNC4kWkJeuOPAf4HFu8imn' +
    'mCnssfXeeymNGwKmppjiXgTpRWDKwnyXJ6cQUUMHlFwUHUqOpR3YFSE5rQUdLEmnv7y%2B2UzpDFhDV5%2FdkeIalSupibrVOyeGj' +
    'yh7v%2F79qWnz1vT8K%2B%2BaqdwBK9uNAGoC2Orj3HPPdfwFDut9QvBwnTVrlnpguOGcc85Rhoq1LaL2mEDGEHRm6%2FAMv0CR0L' +
    'Gj67yLEzAsS%2BdKwc1HU5mkvFJmEAEEfrzlCLaDIYaTB959l5I4PYjEq8hckH69hkpAaFNdoNwQeTsGpYaUlTei9Nbt6YvlR%2Bn' +
    'R1zaZZ7vjJ6e3U7%2B0KvUczTqW8opfyo0yY%2FgI0sTwA6%2F2R40%2BjyZM%2FDt3VvdJ9csuvUgJ1tjUBV3AKOaCCy5QfVe%2F' +
    'VxG0EQgI9wu9Rtjdd9%2Bt0rkBeUp%2BOqJORGhwGZ5B0PHQ2TbzjXnZhMsKvHEr5puFMlVHAyFPlA9lRllxHVRuAT%2BFg5HRlkm' +
    'TqHjHDjrOnUXu304EaADpaBDVoKbilfKwo6EAeih1odcHRMKOFpWxdiZSyfEm9OWKwzT%2BseX09jxvC017dkylq85qy8ptbCMM0d' +
    'shEsTFcVuxJSBDEhF0Ssxj4Vqwdk8ZcRo1SmpJN9%2F7DO3a7b7EAJj8l4eUxMfXnQcTNr0%2FhUcG%2BIgdw2JpI3lIgGxBQpgbO' +
    'u%2B884JaQ%2FgyH%2Bda%2BwUQ9YEzLoDOjAJiAhZkhOMdbGW0%2FNnPzFTe0Ra%2FlcaWFRqnOoDyQnlAQigryo3jVVu3Uvvf%2' +
    'F95MZQ%2B8PVs8aJDacbKUCQWdy6mDifLi124bcQPGcaNhq5O1V16pfq01ju%2BxoeDHbzIpa2cuZe06RLt2smTl006WlZn76Z3Zm' +
    '%2BmdL7fTKx9spTseX0LXPbqYXvl0h9ov2gtaNk2kB35xApUXHw48BKNFRDtyCmlLVgFtzzlCW3cXsD%2Bftmbl0bbdebR9Tx7t2J' +
    'NPr3%2B4mP47ZwXdPOkFJqHn%2BAEcnDwvu%2BRCSuW%2BArHrpLUJWEb4SW38pLSQrrz5xZwQ5pIwjFO%2FeBMEv%2FzlL9VbRbu' +
    '%2BXC1EpHdsSLjDM7y5Shs8WPmr4ykhjY68UV4MJaW8eAo04WvjsxI3YAHmpt%2F%2Bllabv6CBHQWOs2mOOgABK0uOyadozRr108' +
    '87mdxWccPN56cmfqJa9sRWSwJgKjQArFyyhR6d9DY9fP879MCfPqA%2FPPgJ3f%2FI5zT5n9%2FTrI%2FX08xPNtKXP%2B6mnNzQ1' +
    'tNg4eLfb%2BP2Ks5TDxS0I9o2Wg%2Bx3PxiuvOJ7%2BmmR7%2Bm8Q%2FPphu47Nff%2F1%2B69t43adzdr9I1d79Mz7%2F%2BFT33' +
    '6hzK3OTtl4ebN29Gjz50P%2FvQ9sb3c9Eqb7QASwc%2FKw3DAjKIH77Y7gMvXjDUAlkFAyapzzrrLPWAtuvL1UJEEFQoOjYKLlbGB' +
    'i5wW2ZFr9C%2FtLcWPFpAvkKcKK%2B%2BrcEX8%2BdTHyYPzFMFA%2FYvArHgq3uQjPwuPQTHCMdPP%2BNnp53WS4lF5SN09OvalF' +
    '68ZxAdLz6k9E10TvSxLgK%2Fe%2F%2FZ%2B29ww5cFHlrQu9rE5ZdfroaWbgDxzOMHqBcrSPAyjxrQr9SD2aY9qoV6pXNDGXQrYwu' +
    'bcW6%2Fe2YFvrRvxOfbMWg0gbxRPpAmTEd5k4Vx8fJdu6hXkH2EogWfhMLDTRd1pgeu7065e3dSclKiake0Z10lIGDggD708X%2Bn' +
    'U0mRMdkr1kY0LbhwcP%2F999PChQuDklEomDhxolqq4nZv1UpEYmWIhYGOXc6kFGy4A0T7S3s3SHlBmFjTo79WxyR7VqtW1O%2Fzz' +
    'z39emu4aMzX8%2BEdGIZde25HeuvBYTSsx3Hau2eHaju0G%2FQOOhMKEWGyOTW5%2BgngxH4n0KzpT9CsV56i7D271IMP5Ub%2FqC' +
    'vkidf2%2BIkgzAFFCvxs9T333KP6Eu7PqV2qjYhwQZhh6NwgIhQEx5vZwsjwsEGY9Uv76oSUFxUFRZZ1PlASlHvlpk20sqyM%2BvN' +
    'QLZKFmXbAsK%2Fbo49Sic1q07oMvU3gl%2BPDhYepRftWyh9tYG3QyX3T6f5re9JrfxhCp%2Fcup62b1lBp0RG1Ot26MNQJUl6kgw' +
    'BZWbvphI5NlT%2FayGjVgsaOOZNef%2BHP9NrUP1Pc8SJavnypWswqq%2Bqh5xApT20CPzmF4dfixYuD7kHthgcffJCeeeYZVdfgA' +
    'be%2BXOmupYEgRcXFrquLEYc3QE5AHiAe6yTweu7U%2BGE%2Ft1fjmNBud8stgS%2FtnQoP6GXGjH5y%2F%2F6OlgvyhSTabEMg5U' +
    'VZYRFBQbAAEX6EZeXk0NeZmdRs8mQ6efdutUl9sM9AnIDyYVlCvw8%2BoJH89Enn%2BsAvglih3xtE7QzA9%2Bc2Z5Xcp4%2FrEM%' +
    '2BaJ6zU1BN6cpmamymqIq1rZ%2FWjmFZIHtKhIZkb19OZ4y%2BhgecOo%2FjE0Oc72rRKoYG9WrGk06ATWtCVZ3UwiOf%2BIfTBX0' +
    'fQbRdx543LpiWLFlBB3kH1sals4g4S8tqZkQbtLbJxQyZl786iR8b3orOHtg58LBsQLssQLtOQ3q1s96wefmIXOnlgNzp5UHe688Y' +
    'L6TcTLqYnHvglffvu4%2FT1O0%2FQHTdeQscK9tOc2Z%2BpN074Wh8fyeLBh%2BtL%2FQn0NoKg7bHNCPqRE%2FB2y06v7fKxA%2F' +
    'LGFh1Ih49XYRWBSPDrrvg0wyvGsW7jd9BuvPFGdU8g2mBWaqPy8vLjeL2MAmLPWezEDxcnDOvXj7qZhc7lcSPQYuhQ9TM1x%2FbvZ' +
    'w1NC1zAClQI8sWqWGwNgF3ZsLk2FB%2BKc1Lv3tS6c2fK0yZucc30k0%2Bm4rw8KiwvD4z17fJH3ljvg7dx2A0S37ThWkO5zL24QR' +
    'K4gfPXr1ev1VN79aIkJhXkq87l%2FBLNp5AOKTMUBeXEZBzKLr%2BDD%2FMdZIdyncTX6dSlC5Xy0yOPG6x05041YW3dxgSkg9%2F' +
    'GB1LPPptS%2Bb7judPsZcvwIF8HwDoMdCjUJepAlAlvK1AG3B8WWaIcvfiaw%2FghUMT3fYyvCeCcBFyH7%2FMI1zGuaWfm440F7g' +
    '35oD2QJ55%2BHVj5Ths5korzC%2BjIrixkqCQuOYVa9utNhfsOcJmNn42RtpD6B6QN0L6oJyhzj67dqVvP7qqThYJDeYWUX3A4UPb' +
    '8%2FINUWJCnyoyy46EgwxkZislDDmWz0xUr0IboaHj1vHbtWtq8ebO6B%2BR3yoiR1K%2F%2FQErmNq4Cs12Oqzdc8Oid%2FjiVcp' +
    '0gbF%2FOHlXXubkH1DVQdjzU0M4Y7qB%2B8KDDfaDcVj3EuXZtjx%2BIxE8%2Fo6x4qwugnmC9Y%2FsR1D%2F80vZO%2BfRmHTyZ%' +
    '2BxnIAvGSBzbNx0er%2BGkg9CXEoa4QjsWZOAZeffVVZTHpb8tQLpQBk93QKaRFu%2BC%2BdSJygiIiFBhKhU6HwoKIQEwohHQKLO' +
    'FGZghDhaIypfM4XQD5ovOi0ZEnKgp%2BFBKKjPPwVICLxoCSoVKkocRkFaXUoVeylBnkAWVFHADCQ564ByiZjHmRNyrJrtw6GaEOU' +
    'F40HlwcS%2BOoNUGcDk9iTMThOu1YsaxKVcxpc7kOcA9oIDQwzpMhIMoCF%2Bej04oCqXO5DLgu6g2Ce0V94nwoMQTXgyWA%2FHCP' +
    'uGf47eoN%2BaLcqCfUF%2BoNeaLtJU85F%2FWD%2BsexPLl1cpO2BZAHyocOoreB6I4XSL5wRR9QH9AvXBf3iPLogjIiHmlxjvV%2' +
    'BnYB7RVuCjEFCW7ZsCeg86kfq3ytwXSm3lBllQ5tCP9C%2BqEO0NQRhiBfytALXj0bbW%2FPBwxq6DB1GHPoxyoo8UB6cB1ELerkd' +
    '5cdGoe%2B4Lq4BYL8llB1tAOBa0GvUHa6F%2B8Z9gh9Eb4K1TyNWFkVEUmCQEW4ahUABpFFQQBQWlSidBxeRzmMHKCIKh5tBBaAj4' +
    'hpyc8gb5yJvVAgqFwyK%2FJE3wuwaCsC5yBvlRJmRt3QCVBpgly%2BAYyclAISMpOyoZFwHiipPCrGORHFxDgTAPcl9QVBHuB5EGh' +
    '33JwqFhtPLI%2Fkgb1wP94Z7RN0JiSMN0uM8KISQGhof18B1rZD7wj2hjTEpKe2BcNwH8kR5USY9T1FUaWvkhfIBqBe0r%2BgN6kb' +
    'qxAukviC4vpRB6ks6iy6IQ3mQVs71CpQLeoJ6BRnJKAD6gzb1Wm6BlBvlQVlRd2gTdFwI6g%2F9Bm2OONFriB2kbiNte7d8pO%2Fp' +
    'eaCsOEbdoC4g8vBFmLS31A%2FOl3sWnUYeuFe4ul4Hax9FRMgYN4gLSqeDX5hQLoibRKFxQbiiDG4QwoCy6x0ZYYgD5CmCgkveuJb' +
    'bDaDMOB9KjzyRN64hRIR4XTGQLwRAGOLcKkfyR16oB1wH5RbBMQT3IdeDAMhXFE06FK4pIp0JgmOkwTnW8uD6uB%2B5P7i4plxP8h' +
    'clgMCPMMTZAXniflBXaGfJE%2Feh54mySZ6oP7s8pf0kPxEcI07qIxikvvR6Q%2Fvgmqg7uLpIGrs68wrUIdoRHRMECkHZRS%2B9l' +
    'l3KApHyou7QDqg30WWI9BekDYZotb2ej7S39BHUHcok5YTgfNQBriXXFn1Hu0qegJQB96bngXIgTMripY0UEcGDzCG4GAoKV24akI' +
    'ui44hyeLkIzofg5pAnRO%2B8gOSNfCXvYEQB4HzkY81bryjkgzylwwNe8hYgL%2F06%2BrX068m9CHBtub6UAdeXe4MraSB2QJ7IW' +
    '66JdtHvD%2FeAc6Xe5BpO%2BQGSJ%2B4H%2BVnzBKR8elvjWtY6k3uGizxEpG0lPhjkPuQaIlI3uiBczokEUg%2B4f3Qy6Wi6XnqB' +
    'lBOutLXUH8Ta1l4h5UN9RtL2ej7IQ9dZKbOeB87HOfp19fMkT0A%2FH7oiIuVAPMQLAkQESKHFlZsGJFNcINSLANZ8tcsqSL6h5o1' +
    '89HwhOqz5AqGUG5CyWq%2BjdzhJI5B7gFjLAFdP4wbJW65pvZaev563G0LNU8QNep7W%2FIJB8vbqRhNSB7qEAimT1DuOxW91Q4Ve' +
    'pxBrvcq1IPp1rbDmo9%2Bjnod%2Bvp4eeq6fJ2XAuRAhX8lDwkNBJSISSJA1SjIP9SI6kKfNJSPOuzrLrMN6nVCuG0lZnK4DhJtvd' +
    'eYZLsKpm2gg0nID1VX2aLWTUz441%2B58Pb1%2Bjvit13bKxwtsiciHDx91E7Nnz6YpU6aYR%2FaYO3eu6Ysd%2BETkw0eMABPqWM' +
    '%2BDZRdOwJqfrVu3mkexg%2FAGrz58%2BKhx3H777a4kBISyArouwSciHz5iAPh1DOwJHQyxSkQhD82wkZds5hUJ8NlDpF%2Bzy7d' +
    'jPnzUZ%2BBTiqFDh6qhWTDMnDlTfesVawhrjmjzXXfRrqefNo9iH%2Fr3YMGAytIFLzTFnz5qlHIBCRMBvBxnnHoqxTWp%2BLBR4g' +
    'A9ncApvjU%2FGdOisI2Dj9rH2WefrTYi84Jly5ap3RBjDWFPVmezqbiRx6xuv1VfHyHEE4rrJY3VBbyks7pucSCn7qNHU68LL6S%2' +
    'BY8ZQvEZ4PuomsFHZY489Zh65A59p4FOOWEREb83wtfmaK66g4iATaPUJbh3dyfWSxpoWcEtnTe%2FF1f1NWGkHswl%2FzqRJ1NIf' +
    '3tZJTJs2TU1QewW%2BfMeWHbGIiCarsSfR0B9%2B8DysaShAZ9ddLwglLeAlvVs5jh46RN%2Bzoj%2FavTu9OWGCOvZRd4D1QqGQE' +
    'DBq1CjTF3uIyCISYHiWec01yr8%2FyE%2FOxjqcLAyvrpc0cAE9zCmdnesljTVtEltI42fOpP4R7MjnIzpYwCMNzAvhY9NQEKvzQ0' +
    'BUiEjHVh7T7vA4po01oKKsHdnJ9ZLG6up%2BIFh6cb2k8Zr2uunTaeT48ezzURsI5Q2ZjlieHwKivo6o%2B%2BTJ1I%2BfrF5%2Bg' +
    'icWgc7qxXVDOOcA4ZwXatrXeJi2IQrLM3yEhnXr1imBJRQqCQGR7C1dF1AtCxqxH%2FPguXMjXicUK7B29mCuG%2FQ04ZwXyTmCl3' +
    'iYXdLA3obWJvDTziNHjlSib78aCsaOHWv6YhPVtrIaE9nDeMxanyayo9HZg7nBEM55oZ6Tn51N30ybZh75qE5gUlqsoHAsIQAbkeG' +
    'NWSyjWj%2FxwKpnWEbR%2Fgme%2Bg4QRajkoSMa58wJ8oW3j8jx%2Fvvv0xVXXBE2AQmwkhpkFMuoViICMDwb8N571GniRDMkNmHt' +
    'qF5dN4RzTk0hj62inQ4%2Fje0jcmCNEEgo1DdjdsDv0Mc6qp2IBD2fekpJLMOJOMJ1g8FrPlbXDaGc4xNR9AHiwfqgUNcIOQFvy0a' +
    '7%2FEZgrKDGiAiAVQTrKBbfqDl14Opyg8FrPlbXDda0O1esMH0%2BogFs4YH5IFhD0QLmhmJ9WAbUKBEBmC%2FCauxwfyW1NuClE9' +
    'vB2rFDcYOlcUOwc51cK3b4FlHUgDdjWB%2BExYrRBH5NtT6gxokIwJu0WHujhs4arCNb3XCgnxssfyfXDV7zENdH5MA%2BQng1H2x' +
    'Ts1CBVdT1YVgG1AoRAbCIYBlhzVFdh945dQGi7UaKSPIPJa2P4JD5oGuuuSYqk9JWPPTQQ6Yv9lFrRARgrgirsLvW4Qp165TWjhtN' +
    '10saOzccOJ3rL2oMH1iYCCsomvNBOmANxfraIR21SkSCbg8%2FXKc%2FC0FH1QWobhfwmjZS1wl4he8jdGB9EOaDMC9UXahP1hBQJ' +
    '4gIwBANQ7W6tvWrXee1C3NzvUI%2FzymvmnZ9hIa77rorKosU3VDfrCGgzhARIJPYLerIBJxb53SKs3N1AZzc6kaw6zu5PoIDH6xi' +
    'KPZ0DWyhXN%2BsIaBOERGAldj4LKQurMRGR7TrnHZhXl0vaQRe03p1Q4U%2FR%2BQN%2BIWN6ng1bwd8ZV%2FfrCEg6vsRRRN7Z82' +
    'i9RMm1Mq%2B2KgUkWB7%2BIQb5%2BYCXtNWp%2FvcwYOU0kB2UQgVeB0%2FgfUTH67WBLCKOjMzk9rVwx9FqHMWkQ7MG2GollILv9' +
    'WETmgVwOoCTnFwdQG8uoDXtE5upEA%2Bm2vgKR%2BLwNog%2FOpqTZEQ8NRTT9VLEgLqNBEBIKGaXm%2Bkd2S9c%2BsCWP3BXF0AN' +
    '1f8XuGWR7gu4K%2BurgxYQVgXBKnOCWkrMBwbX493zqzTQzMr8Ftq2Iq2uodqMiyBBPNb3XDjrC5gDbNLV91uU34CP7tnD%2FsaNr' +
    'AgET%2FrM2XKlGpZnOgG%2FHor9qOuD9%2BUOaHOW0Q6MIGNiezq%2FE4NnU8gfrhOAuhuuHFW1ynMKa66XKwleuOuu4yABgoMw7p' +
    '3706PPPJIjZMQyAc%2FEVSfSQiIKSICZOfH6nrFj85nFUBcQA%2FTBRAXsIbprlucQPdbEez8cF07zGZL9N8TJtCRGhyK1AXg11Xx' +
    'NgzDsGh%2FJ%2BYV06dPj9nfsw8FMUdEACwiWEZdfv97MyQ60Dul1W8ngO5a%2FdYw3QXc0jj5q9MFnOK%2BmTGD7unXj9Y2gI315' +
    '8yeTRdfdBGdc%2FbZ1bo6OhgmT54ck79jHw5iao7IDvgdNbziL43waY1KEJH5EatfP7ZL4xYWanrAGuaWPtS0dmFw7cKs7k%2F4Af' +
    'Czhx6ihHo0XMhj%2FXmLh2CPT5lCW7dtC9xvbeG2226jqVOnmkf1HzFPRMAxVhz89PXhCJ5e0slE9ONg%2FnDig8UBbvGhuF7ShOp' +
    '2wWcGkyaxj%2BiMGH5qb2fdeYLJ5%2F%2BYhHKZjOQe5T5rA1i0%2BNlnn5lHDQMxOTTz4cNH%2FUK9sIgAvNLfePvtlD1jhhniHa' +
    'gAEeuT3xqu%2B%2B3CgsW7helxgFu8U1ww10uaUFwgo1s3uuDWW2kMDydSY2AV9qIFC%2BjL2bPpizlzaCH77e5L%2FDUNfND6Az7' +
    '%2BrudvyayoN0Qk2D1tGm2%2B6y7Pa41w8yKifHbH0fBbXbcwwC7eKX0occHiQ3EBOcac0Tnjx9OZV19NfU49lRLrQGfauG6dcufP' +
    'm0dfMfGAgI6ybgS7L3FrCt3MXSdAQvV19bQb6h0RAZgryrzmGjpiKqEbROF0sSqjNdyL32u8UxxgF66HWY%2FdXC9pwnEB%2BO3iQ' +
    'UZ9WQaOGkX92G1ZjR0s%2F9AhWsPtvonbfOf27bSYLZ0d27apOSDArnzBXEhNAN%2BQgYCAhvCq3g71kogAWESwjGAhOUGUTVc83W' +
    '8Ns8bZhQfze40H3OK9xEUzrVM6QPx28VYXxARLqScPQVKbN6de7KZxR0ScwM4Pt4DJZq35QgLH%2B3JyFPGAgPC5BcJwHes1AWuYF' +
    '7cmABKaO3euGpI1ZNRbIhLksikO68j6eh83LSLK5%2BU4Gn6ra%2BcHnNI4uV7C3NI6uW5xgFNcXXEBr2nhir%2B64ZNQBer9W7OW' +
    'Y8bQyZmZyhVAyUIRIFg4EMxvDRPoYVYBrH4n1ylMjxPoaYK5ugDWOKAuu17S6G5NwCehyqj3FpEOfDQLbL7%2FfirjoRtuXESegnb' +
    'H4cQ5pfEaD%2BjHbue5hTm5oaRxCocLWOO9usHSuMXprjXMGg9Yw4K5kOqCT0JV0aCISIBJ7LUTJtChBQuqKJ%2BINcztOBp%2Bax' +
    'hgF27neg1zcsONgwsES2PnekkTLRfwmlZcSHXAJyF7NMgFjdjjaPgPP1DfqVMpjhVDFC8aAgTz2wmg%2BwG7cKsL2MXZhemuDre0u' +
    'gBWF3CLA%2Bzi7cKqy%2FWSxs6NNnwSckaDXlnd6bbb6PTMTGo%2FbpxSPl0At2NdALtwCOAWBuhxdgKEEiawhumuLoAX12uYuOJ3' +
    'gtu50XQB3W8Hu3OiCawTwit6n4Ts0eA%2F8UjCl%2FwzZ9LJn31GyawsUESIbqLbCeB0DOhxduGA1S%2FwmsbqWv3WMCdXF8Dq6rC' +
    'LczoPri5AbbhOft2tToB8YAk11DVCXuB%2Fa2YiY8wYGs3W0Qm%2F%2F30VxRUBrGGhCmDndxLALlwE0F2nMKc4K%2BzS6AJY4wCr' +
    'K7CmFQFCdYPB7Tw9zCmduNGEkJCsnPZhD5%2BINKifwJ48mUYvW0ZtmJhEaUWsVhLgdAzY%2BZ0E0P2ANU5cq98uDLBzdQGcwpxcX' +
    'QR6vLjWNFbYnRPMDZYmFEQzLyfgK3oMxzA35MMdPhHZoDk%2FxU7jodpZ%2FCSDH8qpK6pXAYKFA3Z%2Bu2NrGCAuYI0XAawuYBdn' +
    'F6a7Oryk95rGq%2BsljdX1kkZ3owFsdN8QtniNFnwickHG6NF0PltHJ0%2BfruaSoKhWAezCrQLYhUMAO78ugJ3fTgDdtYuzCxM4x' +
    'enhEgbo8U6uLoBX1w5ezxUXCCVtpMDP%2FmCLV5%2BEvKNBriMKB1gAufaxxyjzmWeoyPyuCWI3qW0Nk2OncDs%2F4BRn9XsNs4t3' +
    'i7MLs7qAW3q7sFBdL2ncXCCUtOECQzBYQaPryE%2BmxxJ8IgoRR7OzaeUjj9C6adOU8uqKbHdsjdPD3M4DnPKxO99rfKhhwdIDTuf' +
    'Ypfea1sn1ksbqAsHS6WnDASalQUL%2BpHR48IdmISKZh2gjpk6lq7Zupe4264%2BsAtiFQwC7cBHALlwEsPPbhQHWMGuc7re6TmG6' +
    'AG6uLkAw1w5ez9VdEcDJjQTY4B6T0j4JhQ%2BfiMJEGivdqJkzaeyyZdT18ssDyq4ruJMAoYRDAK9%2BcZ0EEBfQw3QBrHGAU5gug' +
    'NXV4ZRGd3UBwnUB%2BL2kCwUYimEuaCbrgT8fFBn8oVmUcGD5cvrx%2Fvtp%2B%2BzZSrHF1BfRj61xepg%2BRHCKs4brfruwYPFu' +
    'YXZxuh%2Bwhtuls7pucU6ulzR2aYFg6eGGAryaBwk1xN0UqwO%2BRRQltBoyhC7%2B7DP6ydy51GH0aKXcTiJwirMLhwjs4kQAu3A' +
    'RwOoX1y5MYE2nC2A9BvQ4q6sL4OTqCJZWd60CBHO9QKwg%2FMqGT0LRg28RVROy5s2j%2BWwh7Ta%2F8IfI09fqt4bJ09kuLhJ%2F' +
    'tMMggDWN2zlOYaGkDdUF4HdLBwkGzAXh1bxPQNGHT0TVjD1MRIumTKGN779fSekhbseAfuyU1kt4ML%2FXeLs4INRzQomLRlrALZ2' +
    'kcQLeiIGA%2FNfy1QefiGoIedu20Y9MSKtmzKASc1M26Qgi%2BjFgDXPy68fB0kc7HnCLt%2FqDueHGObkQIFg6O8Dyeeihh9Svrv' +
    'qoXvhEVMMozM6mpdOm0aJnnqGjhw5V6jC6H7CG6X63OPF7SW8XZhfvlA7wktYtzMn1GhbMBcRvFy9pBHgDNnHiRJo0aZL%2FnVgNw' +
    'SeiWkIpW0Ur2Dqaz1bSQbaWpEPonccaFo5fPw6WPli87hcXcIu3Cws3fShpdT%2FglA6uDlg%2FsIL8eaCahU9EdQCbZs%2Bm5a%2' +
    'B%2BSmvff5%2BKzWEbAFfvNHbH0fZ7DRM%2FoIe7pQ0WFk4aL2mBYPH4SBUE5C9KrB34RFSHcIyHaitnzaKlTErAdoc9tfVjJ79Tn' +
    'FMau7ROft0FrPHWNMHi7MK8pLELs3MB%2BO3ib%2FQJqE7AJ6I6jH3r1tGCF16g5UxOednZgc6kdyRxreFufv04WPpg8UA457ml85' +
    'I%2BlLSANfwGJqAHfQKqM%2FCJKEawjMlo9QcfUCYP445YJrmtncwu3Ivf6Vy3tECwNHZxdvFucXZhTq41DIC%2FWYsW9AsmoHsnT' +
    'fLngOoYfCKKQWzjIdsqJqU1TEo7ly937IRWv34cSRo9HrALt4bZxYeazi2NXRjck089lf8S3XTrrfTzceP8b8LqKHwiinHk85ANhL' +
    'R2zhxaxW6hi7UULb8eBgRL4yXMLs4u3ktcG7Z2Lrn8crrjd7%2BjPv6G9TEBn4jqGbbAWmJC2vLjj7SR%2FW7E5BSu%2B4OdC9id5' +
    '%2BQPNcwuzi4%2Bg8nnYiafK6%2B%2Bms70V0DHHHwiqufYs24dbWJC2mgS0zYeyukdWu%2FMdh3demxNAwRL4xTvFmfn148TeIh1' +
    'OhPOyFGj6Ax2h5tDMB%2BxCZ%2BIGhhgIYGQNrBkrV9Pe7dto3Xs1zu8Vz9cwC2N7vcabxfXg4dYA4YMoaEjRtBpTDwnst9H%2FYF' +
    'PRD4UdrHlJKS0iwkqm%2F2Z7HcjDFEcp7hQwyBpLVpQPyYZEE%2B%2FwYOpJ7sj%2FaFWvYdPRD5ccZgtqM08nAOWz5unyGIHE9WB' +
    '7GwlwDYmMSdisRJPHyYZkA38rdq1o259%2BijSac3%2BET7hNFj4ROTDh49ah79Dow8fPmodPhH58OGj1uETkQ8fPmodPhH58OGjl' +
    'kH0%2FwGkLIZfM30I7gAAAABJRU5ErkJggg%3D%3D';

    return iconImg;
}
