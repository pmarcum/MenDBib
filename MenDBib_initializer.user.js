// ==UserScript==
// @name        MenDBib_initializer
// @namespace   https://www.sharelatex.com/project
// @description Initializes MenDBib by putting in the MenDBib application keys for Mendeley and Dropbox into localStorage for MenDBib retrieval
// @include     https://www.sharelatex.com/project/*
// @version     1.0
// ==/UserScript==

// register the MenDBib applicatoin in the Mendeley portal and put the
// code as a string below.  The portal is: dev.mendeley.com/myapps.html
mendKey = "";
// register the MenDBib applicatoin in the DropBox portal and put the
// code as a string below.  The portal is: www.dropbox.com/developers/apps
dbKey =   "";
// in the below string, enter the ID number of the Mendeley group whose content
// you want to turn into a bibtex file: 
groupId = "";

if(!localStorage["mendKey"]) {
    localStorage["mendKey"] = mendKey;
    alert("just stored mendKey!");
}
if(!localStorage["groupId"]) {
    localStorage["groupId"] = groupId;
    alert("just stored groupId!");
}
if(!localStorage["dbKey"]) {
    localStorage["dbKey"] = dbKey;
    alert("just stored dbKey!");
}
