// ////////////////////////// TRANSLATOR ///////////////////////////////////
// As the text versions of the pdf files are generated, they need to be "repaired" because
// of frequent poor conversions (see repairPdf2TextConversion for details). The repairs are
// done by searching for the word(s) with the largest possible number of characters within
// the text, starting first with "priority 1" words of that length, then "priority 2", and
// so on.  Identified words are flagged as being characters associated with a word to remove
// them from the pool of available characters for future word id's.  Then words of a size
// that is 1 character smaller are searched in the same way. This process is repeated with
// words of decreasing size (based in the "nChars" field in the translator) until no words
// can be identified.  The Oxford dictionary API is called as the last step in each of these
// phases to make sure that a dictionary word of the desired length can help id a group of
// characters before moving on to next smallest word.
// The function of the translator is to:
//   * provide words that might not be found in a formal
//   * identify phrases that hold special technical meaning (like an acronym)
//   * provide supplemental linkage between these kinds of words and other words, to group
//     similar concepts or topics together so that search results are comprehensive.
//
// The bulk of the translator (hereafter, the xLtr) is to consider all the ways that a given
// word, jargon or phrase might be presented in text, and to identify it as the same word. For
// example, the following are all the same thing: "de Vauc profile", "r^1/4", "r^0.25". The
// xLtr will identify each of these and insure that their appearances in the text are all
// documented under a common index word or words.  In this particular case, for examplem the
// locations of the presence of these words would be docmented under "deVauc" and under "profile",
// such that a search of just "profile" would result in these locations, or just "deVauc".
// The ability to conduct extended searches is also built into the xLtr and the index: in an
// extended search, for example, one might also want to see the appearances of "elliptical galaxy"
// or "bulge" when searching on "deVauc".  Such results would be included for a search on "deVauc"
// if the "extended search" option is set, as the phrase "elliptical galaxy" and "bulge" are
// in the "x" field of the xLtr entry for "deVauc" and for "profile".
//
// The xLtr and index work together as a team. All text, whether from a pdf file or entered by
// a user as search, is first fed into the xLtr. The xLtr determines whether any of the words
// are technical words that are prescribed in the xLtr, and if so, tells the program calling xLtr
// under what index the words should be documented or searched for.  The xLtr is generated
// in real time.  The index is written as an external file and modified as needed.
//
// xLtr is an array object with the following construction:
//   .nChars:  length of each word entry, counting only alphanumeric characters (e.g.,
//        ignoring any characeters specific for regexp commands, like \d\d would be 2 characters, not 4.)
//   .reg: regular expression used for searching for the term.  In some cases, .reg
//        will just be the word itself.  In other cases, the .reg can include captured groups that would then
//        be used to construct index entries, along with special code words provided in the .indx (see below)
//        that gave instructions as to what to do with the captured groups.  For example, for spectral lines,
//        the .reg might be something like "\\[CII\\](5456.556)angstroms", which instructs to capture the
//        wavelength so that that number can be used for a related purpose.
//   .indx: list of words (delimited by underscores) that are to go into the index and
//        be linked to the position of the word of interes. At a minimum, this list would be the astronomy
//        term itself. All .indx fields must be a function that takes the text, the reg and the starting position
//        and returns the word that should be used for the index.  If captured groups were used in
//        the .reg, then .indx can also include code words that instruct what to do with the captured groups.
//         For example, if the wavelength of a spectral line were captured, then one of the .indx words might be
//        "ang2eV", which tells the code to take the captured group (the wavelength value), convert to units
//        of energy (eV) and then store that number in the index.
//        If words in the .indx have an astericks in front of them, those words are not searched for in the
//        dictionary for additional root words and inflections.  Instead, astericked words go straight into
//        the index as-is.
//   .x:  the "extended search" word list to make future queries provide more comprehensive results.
//        For example, "surface_brightness" might be uncluded with  "devauc profile". Or
//        "carbon_forbidden_spectral_line_singly_ionized" along with [CII]5454. When an extended search is
//        requested, the code will look up the words listed under '.x' and include the positions of those
//        words in the results as well.  If phrases are listed in .x (words delimited by underscore), then
//        the results of that phrase are the locations for which words delimited by underscore
//        are all present. Multiple phrases can also be provided in .x, delimited by vertical bars. So
//        for example, "surface_brightness" would result in locations for which both "surface" and "brightness"
//        were present in the text.  If .x was "surface_brightness|inside_out_profile", then the locations
//        common to "surface" and "brightness" would be one piece of the search results, and another piece
//        would be the locations common to "inside", "out" and "profile".  (e.g., The results would NOT be
//        where "surface", "brightness", "inside", "out" profile" all coexisted, unless the .x were provided
//        as "surface_brightness_inside_out_profile" or "surface|brightness|inside|out|profile".)
//   .xSupp: tells the calling code that other index words should use the current index word (possibly along
//        with other words in a phrase) as their .x fields.  When the calling code sees a ".xSupp", the
//        information in this field is placed in the .x fields of the prescribed words. If a word does not
//        yet exist in the index, a placeholder in the index is made for that word so that its .x field
//        can be populated.  Note that there is no .xSupp field in the index itself, only a .x field.
//   .priority: provides the code using the xLtr with a way to prioritize matching to text to avoid a
//        situation in which a lower priority (meaning higher number) template was matched, taking away
//        characters that may have been invovled in a jargon word having a smaller number of characters.
//   .type:
//   .endMatch:
// Note that when any of these words make their way into the final index, the primary index entry might be
// a different form than what the xLtr specified.  For example, "spectral" might turn into a base word of
// "spectrum", "singly" might become "single" and "ionized" becomes "ion" so that the index entry for "ion"
// points to all places in which "ionized", "ion", "ionization", ionizes", etc is mentioned.
// ///////////////////////////////////////////////////////////////////////////////////
// do not match the word if it begins a sentence (if the word is at beginning or if preceded by a period then whitespace).
  var NNNNNdotN = /(\d\d\d\d\d\.\d+)/.source;  // (12345.6789)
  var NNNNN =     /(\d\d\d\d\d)/.source;  // (12345);
  var NNNNdotN =  /(\d\d\d\d\.\d+)/.source;  // (1234.6789)
  var NNNN =      /(\d\d\d\d)/.source;  // (1234);
  var NNNdotN =   /(\d\d\d\.\d+)/.source;  // (123.6789)
  var NNN =       /(\d\d\d)/.source;  // (123);
  var NNdotN =    /(\d\d\.\d+)/.source;  // (12.6789)
  var NN =        /(\d\d)/.source;  // (12);
  var NdotN =     /(\d\.\d+)/.source;  // (1.6789)
  var N =         /(\d)/.source;  // (1);
  var charge = ['', /\-/.source, /\+/.source, /\-\-/.source, /\+\+/.source,/\d\+/.source, /\d\-/.source];
// above is to replicate something like H2O2-, Na+, etc.
  var chargeDesc = ['', 'anion', 'singly_ionized', 'anion', 'doubly_ionized', 'ionized', 'anion'];
// The below tries to capture transition information, such as seen in molecules (H2O[2-1])
  var levels = [/\[(\d)\-(\d)\]/.source, /\[(\d\d)\-(\d)\]/.source, /\[(\d)\-(\d\d)\]/.source, /\[(\d\d)\-(\d\d)\]/.source,
                /\((\d)\-(\d)\)/.source, /\((\d\d)\-(\d)\)/.source, /\((\d)\-(\d\d)\)/.source,/\((\d\d)\-(\d\d)\)/.source,
                /\[(\d)\,(\d)\]/.source, /\[(\d\d)\,(\d)\]/.source, /\[(\d)\,(\d\d)\]/.source, /\[(\d\d)\,(\d\d)\]/.source,
                /\((\d)\,(\d)\)/.source, /\((\d\d)\,(\d)\)/.source, /\((\d)\,(\d\d)\)/.source,/\((\d\d)\,(\d\d)\)/.source];
  var atomicNum = ['', /\d/.source, /\d\d/.source, /\d\d\d/.source];
  var ionLevel = ['','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII',
                  'XIV','XV','XVI','XVII','XVIII','XIX','XX','XXI','XXII','XXIII',
                  'XXIV','XXV','XXVI','XXVII','XXVIII','XXIX','XXX'];

  var ionLevels = ['',/[IVX]{1,6}/.source];

  var ionDesc  = ['','neutral','singly_ionized','doubly_ionized'];
  for (var i = 4; i < ionLevel.length; i++) {ionDesc.push('ionized');}

  const light = 2.99792458*Math.pow(10,8); // speed of light (m/s)
  const planckEv = 6.626068/1.602*Math.pow(10,-15); // planck's constant (eV units)

  i = 0;
  var j = 0;
  var tmp = '';
  var xLtr = []; // as the below functions are called, this array will be populated

// load up acronym-finding syntax:
  findAcronyms();

// load up bibliography/reference-finding syntax:
  findBibRefs();

// Load up coordinate-finding syntax:
  coordinates();

// Load up astronomy jargon-finding:
  readInFile('astroTerms', '1', 'jargon');


// COME BACK HERE
// the survey/mission names still needs work in order to be compiant with new format for these files!!!


// Load up survey and mission name-finding:
 // readInFile('surveysMissions', '1', 'jargon');


// Load up astronomy journal names
  journalNames();


// Load up mis-spelled word-finding:
  readInFile('misspelled', '3', 'substitute');

// Load up ability to detect British spelling and redirect to US spelling:
  readInFile('britishAmerican', '2', 'substitute');


// Load up ablility to detect contracted words and separate them out into their constituate words:
  readInFile('contractions', '2', 'substitute');

// Load up ability to identify molecular and atomic/ionic spectral lines
  chemistry();

// Load up ability to detect common names for spectral lines and link them to their numerical names
  commonLines();

// Load up references to photometry:
  photometry();

// Check the tranlator for inconsistencies and redundancies:
  //xLtrCheck();
// the translator is done, consider this a one-time-only call for the calling code.
// Note that if the translator is stringified and/or saved  in some fashion, all the functions
// embedded in "indx" will be lost.
 // return xLtr;

// COME BACK TO
// make sure that can recognize declination written as DDd

// ============================ findAcronyms =============================
//  %%%%%%%%%%%%%%%%%%%%%%%%  passed 4/11/2019
   function findAcronyms() {
// Searches text for defined acronyms by looking for text that contains capitalized letters that then are
// repeated following the text (or that precede the text), for example:
// "we observed White Dwarf Stars (WDS), ..."   or "we observed WDS (White Dwarf Stars), ...."
// If such are identified, the acronym is placed in a special category within the index that is not used as
// an ordinary index word, but rather as a "re-router" to the words for which the acronym stands for. In the
// index, the acronym is entered as an entry but with a type=acro, and another field that no other entry has,
// "acroDef", will hold the words that the acronym takes the place of. The words are delimited by "_" with
// the abbreviated paper ID in front, ie "454|white_dwarf_star". Every time the acronym is found in that paper,
// the all the words in standsFor will be uodated with the location information.  If the acronym is found in
// another paper that does NOT have its own acronym entry, let's say for example that paper 334 also mentioned
// WDS but fails to define them.  If WDS has **no** alternative meaning in the xLtr, but a match is made (but
// from the acronum of another paper), then that paper will inherit the knowledge of paper 454 and have all occurances
// of "WDS" be indexed to "white_dwarf_star". KIf there are multiple definitions of WDS within the "acronum" index
// entry and the paper fails to have its own definition, then the characters will remain un-identified.   OK, the
// function here is just to find those acronyms with their definitions ... the main program will make sense of it all!
       xLtr.push({"type":"acro", "priority":"1",
                  "indx":function(text, startPos) {
                     this.endMatch = "-1";
                     this.startDef = "-1";
                     this.endDef = "-1";
                     var smallWords = ['aka','al','am','an','and','are','as','at','be','by','do','eg','et','etal','etc',
                                       'go','he','ie','if','in','io','is','it','me','my','no','ok','on','or','ox','pi',
                                       'qi','so','to','we','xi'];
                     var linkedTo = [];
                     var from = [];
                     var i = 0;
                     var j = 0;
                     var k = 0;
                     var a1 = 0;
                     var a2 = 0;
                     var w1 = 0;
                     var w2 = 0;
                     var tst = '';
                     var t = '';
                     var endMatch = -1;
                     var acroPos1 = [];
                     var wordsPos1 = [];
                     var acroPos2 = [];
                     var wordsPos2 = [];
                     var acroPos = [];
                     var wordsPos = [];
                     var aPos = [];
                     var wPos = [];
                     var aTmp = '';
                     var wTmp = '';
                     var dist = [];
                     var alength = [];
                     var acro = '';
                     var acroDef = '';
                     var fullAcro = false;
                     var twoWordMin = false;
                     var noCherryPicking = true;
                     var noSkippedWords = true;
                     var caseMatch = false;
                     var acroCase = false;
                     var twoChars = false;
                     var notShortWord = false;
                     var notSymbol = false;
                     var startSentence = false;
// Strip out text starting from startPos to the location of a period, question mark, exclamation mark to the right
// of startPos.
                     var txt = text.slice(startPos);
                     var tmp = txt.match(/(?:[\.\?\!])(?:(?: [A-Z])|(?: $)|(?:$))/);
                     if (tmp) {txt = txt.slice(0,tmp.index); }
// filter the text, eliminating everything exept alpha-numeric and whitespace
                     tmp = JSON.parse(filterTheText('Aa0 ',txt));
                     txt = tmp[0];
                     txtPos = tmp[1];
// Convert text to an array of characters.
                     txt = txt.split('');
// make another array of same length as txt that assigns a word id to each letter. Any non-alphanumeric characters
// take on the word ID of the character that is to the left of them.
                     var wordIds = [];
                     wordIds.push(0);
                     for (i = 1; i < txt.length; i++) {
                         if (txt[i-1].match(/ /) && txt[i].match(/[^ ]/)) {
                             wordIds.push(wordIds[i-1]+1); // start new word
                         } else {
                             wordIds.push(wordIds[i-1]);  } // retain same word id as prev. character
                     }
// construct an array similar to wordIds, but one that records the position where the word started rather than
// a sequence of incrementing values
                     var wordStarts = [];
                     wordStarts.push(0);
                     for (i = 1; i < txt.length; i++) {
                         if (txt[i-1].match(/ /) && txt[i].match(/[^ ]/)) {
                             wordStarts.push(i); // start new word
                         } else {
                             wordStarts.push(wordStarts[i-1]);  } // retain same value as prev. character
                     }
                     for (i = 0; i < txt.length-1; i++) {
                         if (txt[i].match(/[A-Za-z0-9]/)) {
// get all the text to the right of the ith character
                             tmp = txt.slice(i+1).reduce(function(x1,x2,x3) {
// locate all the matches in the text with this ith character. At this point, the match is case-insensitive
                                      if (x2.match(/[A-Za-z0-9]/) && wordStarts[x3+i+1] > wordStarts[i] &&
                                          x2.toLowerCase() == txt.slice(i,i+1)[0].toLowerCase()) {x1.push(x3+i+1);} return x1;},[]);
                             if (tmp.length > 0) {
                                 linkedTo.push(tmp);
                                 from.push(i);  }
                         }
                     }
// - - - - - - - - - - - - - - - - - - - - - - - -
                     if (linkedTo.length == 0) {return ''; }
// = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =
// Now map out all the possible "paths" by which an acronym's letters could be matched up with
// legitimate characters from preceeding word definitions:
                     for (i = 0; i < linkedTo[0].length; i++) {
                         if (wordStarts[linkedTo[0][i]] == linkedTo[0][i]) {
                             acroPos1.push([linkedTo[0][i]]);
                             wordsPos1.push([from[0]]);  }
                     }
                     for (i = 1; i < linkedTo.length; i++) { // step through each character in the test, from left to right
                         aPos = [];
                         wPos = [];
                         for (j = 0; j < linkedTo[i].length; j++) {
                             for (k = 0; k < acroPos1.length; k++) {
// need to make combinations for each of these with all the acroPos that has been rolled up
// to this point. In order to be included, the jth value in the ith linkedTo needs to meet
// the following criteria:
// * characters associated with the acronym must be all be associated with the same "word"  AND occur sequentially.
// * all definition words must have their first letter involved in the acronym (which may be upper or lowercase).
// * if there are uppercase letters somewhere in the middle of a word, those letters must also appear the acronym
//   as well as the first character of that word.
// * letters other than the first letter and uppercase letters within definition words are allowed so long as the
//   letter(s) to the left of them in the word are also present in the acronym.
                                 aTmp = acroPos1[k];
                                 aTmp = aTmp[aTmp.length-1];
                                 wTmp = wordsPos1[k];
                                 wTmp = wTmp[wTmp.length-1];
                                 if ( (wordStarts[linkedTo[i][j]] == wordStarts[aTmp] &&            // acronym within single word
                                       linkedTo[i][j] == aTmp + 1 &&                          // sequential acronym letters
                                       wordStarts[from[i]] < wordStarts[aTmp] &&                    // different location from acronym
                                       from[i] > wTmp) &&                                     // char in def must be right of prev char
                                       ((wordStarts[from[i]] == from[i]) ||                      // first letter of a word ... or ...
                                        (txt.slice(from[i],from[i]+1)[0].match(/[A-Z0-9]/) && // is uppercase char or number that ...
                                         wordStarts[from[i]] == wordStarts[wTmp]) ||                // is part already-represented word ... or...
                                         (from[i] == wTmp + 1))   ) {                         // is part of sequence w/ one of the above 2 cases
                                     aPos.push(acroPos1[k].concat([linkedTo[i][j]]));
                                     wPos.push(wordsPos1[k].concat([from[i]]));   }
                             }
                         }
                         if (aPos.length > 0) {
                             acroPos1 = acroPos1.concat(aPos);
                             wordsPos1 = wordsPos1.concat(wPos);  }
                     }
                     acroPos2 = [];
                     wordsPos2 = [];
                     for (i = 0; i < linkedTo[0].length; i++) {
                         if (wordStarts[linkedTo[0][i]] == linkedTo[0][i]) {
                             wordsPos2.push([linkedTo[0][i]]);
                             acroPos2.push([from[0]]);  }
                     }
                     for (i = 1; i < linkedTo.length; i++) { // step through each character in the test, from left to right
                         aPos = [];
                         wPos = [];
                         for (j = 0; j < linkedTo[i].length; j++) {
                             for (k = 0; k < acroPos2.length; k++) {
                                 aTmp = acroPos2[k];
                                 aTmp = aTmp[aTmp.length-1];
                                 wTmp = wordsPos2[k];
                                 wTmp = wTmp[wTmp.length-1];
                                 if ( (wordStarts[from[i]] == wordStarts[aTmp] &&                                 // acronym is one word
                                       from[i] == aTmp + 1 &&                                               // sequential acronym letters
                                       wordStarts[linkedTo[i][j]] > wordStarts[aTmp] &&                           // different location from acronym
                                       linkedTo[i][j] > wTmp) &&                                            // the next char in def to right of last one
                                       ((wordStarts[linkedTo[i][j]] == linkedTo[i][j]) ||                      // first letter of a word ... or ...
                                        (txt.slice(linkedTo[i][j],linkedTo[i][j]+1)[0].match(/[A-Z0-9]/) && // is uppercase char or number that ...
                                         wordStarts[linkedTo[i][j]] == wordStarts[wTmp]) ||                       // is part of already-represented word ... or ...
                                        (linkedTo[i][j] == wTmp + 1))) {                                    // is part of sequence w/ one of the above 2 cases
                                     aPos.push(acroPos2[k].concat([from[i]]));
                                     wPos.push(wordsPos2[k].concat([linkedTo[i][j]])  );   }
                             }
                         }
                         if (aPos.length > 0) {
                             acroPos2 = acroPos2.concat(aPos);
                             wordsPos2 = wordsPos2.concat(wPos);  }
                     }
// combine the findings from both kinds of searches
                     acroPos = acroPos1.concat(acroPos2);
                     wordsPos = wordsPos1.concat(wordsPos2);
// We can immediately weed out any 1-element entries:
                     acroPos = acroPos.filter(z => z.length > 1);
                     wordsPos = wordsPos.filter(z => z.length > 1);
// Now test any found matches to insure compliance with other constraints:
//  * [fullAcro] each character within the group of chars associated with the acronym must have a counterpart in the def words
//  * [twoWordMin] there must be at least 2 definition words
//  * [noCherryPicking] there cannot be any words larger than 3 letters laying between def words
//  * [noSkippedWords]  there cannot be more than 3 words of length greater than 3 characters between the end of the
//    definition words and the beginning of the acro
//  * [caseMatch] If the acronym has a mixture of lower/upper case characters, then there must be an exact case match
//    to those corresponding letters in the definition words.  Likewise, if the definition words has a mixture of
//    cases, then the acronym must provide an exact character-to-character case match, with the following exception:
//    if the only uppercase letter in the definition words is the very first letter (e.g., likely the beginning of
//    a sentence), and the acronym does NOT have a case-mixture, then a case-match is irrelevant. If the acronym
//    has all caps or all lowercase characters, a case-match is irrelevant so long as the definition words do
//    not have a case-mixture (disregarding the case of the first letter in the def. words).
//  * [acroCase] If the acronym has any uppercase letters, there must be more uppercase than lowercase. If the
//    acronym has only 2 characters, both must be uppercase if one of them is.
//  * [twoChars] if the acronym is only 2 letters, special precautions must be taken to insure that it is not just an ordinary
//    2-letter word (like "to" or "so" or "at"). The 2-letter acronym must either consist of all consonants or
//    all vowels. Note that this constraint could likely remove viable acronyms from the index, but the risk of
//    false-positive matches is just too high to accept without imposing such rules.
//  * [notShortWord] acronym can't be among the hardwired list of common "small words" (like "etc")
//  * [notSymbol] acronym can't be mistaken for a chemical symbol (like "Ne" or "He")
                     for (i = 0; i < acroPos.length; i++) {
                          wTmp = wordsPos[i].map(z => txt.slice(z,z+1)[0]).join('');
                          aTmp = acroPos[i].map(z => txt.slice(z,z+1)[0]).join('');
                          fullAcro = false;
                          twoWordMin = false;
                          noCherryPicking = true;
                          caseMatch = false;
                          acroCase = false;
                          twoChars = false;
                          notShortWord = false;
                          notSymbol = false;
                          noSkippedWords = true;
                          startSentence = false;
// get the length of the character grouping associated with the acronym itself by finding in the word ID all matches
// to the word ID value that the acronym characters have:
                          tmp = wordIds.reduce(function(x1,x2,x3)  {
                                if (x2 == wordIds[acroPos[i][0]] && txt.slice(x3,x3+1)[0].match(/[A-Za-z0-9]/)) {x1.push(x2);} return x1;},[]);
                          if (tmp.length == acroPos[i].length) {fullAcro = true; }
// See if an uppercase letter exists in the original text just before or just after the identified acro.  If so, and it was skipped
// over, then fullAcro gets turned back to false:
                          if (startPos > 0 && text.charAt(txtPos[acroPos[i]]).match(/[A-Z]/)) {fullAcro = false; }
                          if (startPos < text.length-1 && text.charAt(txtPos[Math.max(... acroPos[i])]).match(/[A-Z]/)) {fullAcro = false; }
// get a list of all the word IDs associated with the definition words:
                          tmp = wordsPos[i].map(z => wordIds[z]);
                          if (tmp !== undefined && tmp && tmp.length > 0 && ([... new Set(tmp)]).sort().length >= 2) {twoWordMin = true;}
// If these definition word IDs are not consequetive, determine how long the words are that are missing from this list
                          tst = [];
                          if (twoWordMin) {
                              for (j = Math.min(... tmp)+1; j < Math.max(... tmp); j++) {
                                  if (tmp.indexOf(j) == -1) {tst.push(j); }
                              }
                          }
                          for (j = 0; j < tst.length; j++) {
                              tmp = wordIds.reduce(function(x1,x2,x3) {
                                    if (x2 == j && txt.slice(x3,x3+1)[0].match(/[A-Za-z0-9]/)) {x1.push(x2);} return x1;},[]);
                              if (tmp.length <= 3) {noCherryPicking = false; }
                          }
// determine the range of characters between the end of the definition words and the acronym:
                          tmp = acroPos[i].length;
                          a1 = acroPos[i][tmp-1];
                          w1 = wordsPos[i][0];
                          a2 = acroPos[i][0];
                          tmp = wordsPos[i].length;
                          w2 = wordsPos[i][tmp-1];
                          tmp = '';
                          if (wordIds[a1] < (wordIds[w1]-1)) {
                              tmp = txt.reduce(function(x1,x2,x3) {
                                         if (wordIds[x3] > wordIds[a1] && wordIds[x3] < wordIds[w1]) {x1.push(x2);} return x1;},[]);
                              tmp = tmp.join('').replace(/[^A-Za-z0-9 ]/g,'').replace(/  +/g,' ').trim();
                          } else if (wordIds[w2] < (wordIds[a2]-1)) {
                              tmp = txt.reduce(function(x1,x2,x3) {
                                         if (wordIds[x3] > wordIds[w2] && wordIds[x3] < wordIds[a2]) {x1.push(x2);} return x1;},[]);
                              tmp = tmp.join('').replace(/[^A-Za-z0-9 ]/g,'').replace(/  +/g,' ').trim();  }
// If any of the in-between words had uppercase letters, then the test is failed:
                          if (tmp.match(/[A-Z]/)) {noSkippedWords = false;}
                          tmp =tmp.split(' ');
                          tmp = tmp.filter(z => z.length > 3); // don't count words of 3 characters or less
                          if (tmp.length > 3) {noSkippedWords = false; } // if more than 3 substantial words lay between acro and def, fail the test
// For the below tests, need to determine if the definition words start at the beginning of sentence.
                          if (startPos == 0) {
                              startSentence = true;
                          } else if (text.slice(0,startPos).trim() == '') {
                              startSentence = true;
                          } else if (startPos >= 2 && text.slice(startPos-2,startPos).trim() == '\.') {
                              startSentence = true; }
                          if (aTmp == wTmp) {caseMatch = true; }
                          if (aTmp.match(/^[A-Z0-9]+$/) && wTmp.match(/^[a-z0-9]+$/)) {caseMatch = true;}
// If the definition words is a mix of cases that involves more than a capitalization of the start of a sentence,
// do definition word characters case-match with the acronym characters?
                          if (startSentence && aTmp.slice(1) == wTmp.slice(1)) {caseMatch = true;  }
// check the case of the acronym characters, make sure there is consistency
                          if (aTmp.match(/^[A-Z0-9]+$/) || aTmp.match(/^[a-z0-9]+$/)) {acroCase = true; }
                          if (aTmp.match(/[A-Z]/) && aTmp.match(/[a-z]/) && aTmp.match(/[A-Z]/g).length > aTmp.match(/[a-z]/g).length) {
                              acroCase = true;  }
// Now check the acronym length:
                          if (aTmp.length > 2) {twoChars = true;}
                          if (!twoChars) {
// If the acronym consists of all consonants or of all vowels, then it passes the twoChar test:
                              tmp = acroPos[i].reduce(function(x1,x2,x3) {
                                     if (txt.slice(x3,x3+1)[0].match(/[aeiou]/i)) {x1.push('v')} else {x1.push('c')}; return x1;},[]);
                              if (tmp.length > 0 && ([... new Set(tmp)]).length == 1) {twoChars = true;}    }
// Make sure that acronym does not match any of the common short words:
                          if (smallWords.indexOf(aTmp) == -1) {notShortWord = true;}
// Now check that the acronym is not actually a chemical symbol!
                          tmp = xLtr.findIndex(z => z.reg !== undefined && z.symbol !== undefined && z.indx(aTmp,0) != '');
                          if (tmp == -1) {notSymbol = true;}
// Now tally up the scores and see if this acronym candidate failed ANY of the tests:
                          if (!(fullAcro*twoWordMin*noCherryPicking*noSkippedWords*caseMatch*acroCase*twoChars*notShortWord*notSymbol)) {
                              acroPos[i] = [-1];
                              wordsPos[i] = [-1];  }
                     }
// Remove any -1 values:
                     acroPos = acroPos.filter(z => z[0] != -1);
                     wordsPos = wordsPos.filter(z => z[0] != -1);
// If by now, there are more than 1 possibility for acronym and corresponding definition, then select whichever has the longest acronym.
// If the acronym length is the same for all the matches, then select the one for which the words and the acronym are closest together.
                     dist = [];
                     alength = [];
                     for (i = 0; i < acroPos.length; i++) {
                          tmp = acroPos[i].map(z => txt.slice(z,z+1)[0]).join('');
                          alength.push(tmp.length);
                          if (acroPos[i][0] > wordsPos[i][0]) {
                              tmp = wordsPos[i].length;
                              dist.push(txt.slice(wordsPos[i][tmp-1]+1,acroPos[i][0]+1).join('').replace(/[^A-Za-z0-9 ]/g,'').length);
                          } else {
                              tmp = acroPos[i].length;
                              dist.push(txt.slice(acroPos[i][tmp-1]+1,wordsPos[i][0]+1).join('').replace(/[^A-Za-z0-9 ]/g,'').length);  }
                     }
                     for (i = 0; i < acroPos.length; i++) {
                          if (alength[i] < Math.max(... alength)) {
                              acroPos[i] = [-1];
                              wordsPos[i] = [-1];
                              alength[i] = -1;
                              dist[i] = -1; }
                     }
                     acroPos = acroPos.filter(z => z[0] != -1);
                     wordsPos = wordsPos.filter(z => z[0] != -1);
                     dist = dist.filter(z => z != -1);
                     alength = alength.filter(z => z != -1);
                     tmp = dist.findIndex(z => z == Math.min(... dist));  // returns the first one to meet criteria
                     acro = '';
                     acroDef = '';
                     if (tmp != -1) {
                         acroPos = acroPos[tmp];
                         wordsPos = wordsPos[tmp];
                         acro = acroPos.map(z => txt.slice(z,z+1)[0]).join('');
                         tmp = [... new Set(wordsPos.map(z => wordStarts[z]))];
                         tmp = [Math.min(... tmp), Math.max(... tmp)];
                         tmp[1] = tmp[1] + wordStarts.filter(z => z == tmp[1]).length;
                         acroDef = txt.slice(tmp[0],tmp[1]).join('').replace(/[^A-Za-z0-9]/g,' ').trim();
                         this.startDef = '' + (txtPos[tmp[0]] + startPos);
                         this.endDef = '' + (txtPos[tmp[1]-1] + 1 + startPos);
                         acroDef = acroDef.replace(/  +/,' ').trim();
                         if (acroPos[0] > wordsPos[0]) {
                             this.endMatch = "" + (txtPos[Math.max(... acroPos)] + 1 + startPos);
                         } else {
                             this.endMatch = this.endDef; }
                         return acro + ' ' + acroDef.replace(/ /g,'\_');
                     } else {return ''; }
                } });
       return;
   }
// ============================ end findAcronyms =============================



// ============================ findBibRefs ====================================
//  %%%%%%%%%%%%%%%%%%%%%%%%  passed 4/22/2019
   function findBibRefs() {
// Searches text for citations/bibliographic entries by looking for text that has the format of a list of
// authors followed by publication year, journal name, volume number and page number.
// If such are identified, a short citation is constructed from the author list, pub year, etc and then the
// short citation is placed in a special category within the index that is not used as an ordinary index word,
// but rather as a "re-router" to the words for which the short citation stands for. In the index, the short
// citation is entered as an entry but with a type=citation, and another field that no other entry has,
// "fullCit", will hold the author last names, publication year, volume number, page number and journal name.
// All of these items are delimited by "_", and the abbreviated paper ID in front,
// ie "454|jones_smith_white_1997_the_astronomical_journal_676_8". Every time the short citation is found in
// that paper,  all the words in fullCit will be updated with the location information.
       xLtr.push({"type":"citation", "priority":"1",
                  "indx":function(text, startPos) {
                     this.endMatch = "-1";
                     this.authors = "";
                     this.pubYear = "";
                     this.journal = "";
                     this.page = "";
                     this.volume = "";
                     var authors = [];
                     var pubYear = '';
                     var journal = '';
                     var page = '';
                     var volume = '';
                     var journalAbb = '';
                     var tmp = '';
                     var t = '';
                     var m = '';
                     var t1 = '';
                     var t2 = '';
                     var shortCit = '';
// Strip out text starting from startPos
                     text = text.slice(startPos, startPos + 5000);
// From henceforth, need to preserve character positions because at the end, need to know the actual position
// of the end of the match to to a bibliographic reference, so that the text can be masked out, etc by the
// function calling this procedure.
// to reduce complications in identifying the bibliography, remove any Jr, Sr, I, II, etc from
                     text = text.replace(/([\, ]+)(jr\.?)([\, ]+)/ig, function(x,x1,x2,x3){return x3 + (x1+x2).replace(/[ -~]/g,' ');});
                     text = text.replace(/([\, ]+)(sr\.?)([\, ]+)/ig, function(x,x1,x2,x3){return x3 + (x1+x2).replace(/[ -~]/g,' ');});
                     text = text.replace(/([\, ]+)(i+\.?)([\, ]+)/ig, function(x,x1,x2,x3){return x3 + (x1+x2).replace(/[ -~]/g,' ');});
// replace "et al" in the same way:
                     text = text.replace(/([\, ]+)(et\.? *al\.?)([\, ]+)/ig, function(x,x1,x2,x3){return x3 + (x1+x2).replace(/[ -~]/g,' ');});
// replace "and" in the same way ... if there is not a comma, force one to be there
                     text = text.replace(/[\, ]+and[\, ]+/ig, function(x){return '\,' + x.slice(1).replace(/[ -~]/g,' ');});
// replace "&" in the same way:
                     text = text.replace(/[\, ]+\&[\, ]+/ig, function(x){return '\,' + x.slice(1).replace(/[ -~]/g,' ');});
// Occurances of hypenated names is a problem, like Smith-Jones.  replace such occurances to be "Smithjones".
                     text = text.replace(/([A-Z][a-z]+)( *\- *)([A-Z][a-z]+)/g, function(x,x1,x2,x3) {
                         return x1.charAt(0).toUpperCase() + x1.slice(1).toLowerCase() + x3.toLowerCase() + x2.replace(/[ -~]/g,' ');});
// Occurances of names like O'Smith are a problem. Replace such occurances to be "Osmith"
                     text = text.replace(/([A-Za-z]+)( *\' *)([A-Za-z]+)/g, function(x,x1,x2,x3) {
                         return x1.charAt(0).toUpperCase() + x1.slice(1).toLowerCase() + x3.toLowerCase() + x2.replace(/[ -~]/g,' ');})
// If O'Smith got rendered as O Smith, try to catch and fix that situation as well by turning O Smith into "Osmith"
                     text = text.replace(/([A-Z])( *)([A-Z][a-z]+)/g, function(x,x1,x2,x3) {
                         return x1 + x3.toLowerCase() + x2.replace(/[ -~]/g,' ');})
// If there are characters that are all lowercase preceding a set of characters that start with a capital letter,
// scoot the lowercase characters into the other characters, so that "van Smith" becomes "Vansmith"
                     text = text.replace(/([\, ]+)([a-z]{2,5})( *)([A-Z][a-z]+)([\, ]+)/g, function(x,x1,x2,x3,x4,x5) {
                         return x1 + x2.charAt(0).toUpperCase() + x2.slice(1) + x4.toLowerCase() + x5 + x3; });
// There could be the case that "van Smith" was rendered as VanSmith, or that O'Smith rendered as OSmith.  There can
// only be 1 captial letter per last name, or the below algorithm fails. Need to fix this kind of situation so that VanSmith
// turns into Vansmith and OSmith into Osmith. To fully cover all bases, find every word that starts with a lower case letter
// but has an uppercase letter somewhere later in the word, and force all characters to be lowercase except for the first
// letter, which is forced to be uppercase:
                     text = text.replace(/([\, ]+)([a-z]+)([A-Z])([A-Za-z]+)([\, ]+)/g, function(x,x1,x2,x3,x4,x5) {
                         return x1 + x2.charAt(0).toUpperCase() + x2.slice(1) + x3.toLowerCase() + x4.toLowerCase() + x5; });
// And now get any word starting with an uppercase letter but has other uppercase letters somewhere else in the word, turn
// unto all lower case except for first letter (note that we are about to really mess up any legitimate acronyms, but
// that's OK because these changes are not permanent to the text
                     text = text.replace(/([\, ]+)([A-Z]+)([a-z]+)([A-Z])([A-Za-z]*)([\, ]+)/g, function(x,x1,x2,x3,x4,x5,x6) {
                         return x1 + x2.charAt(0) + x2.slice(1).toLowerCase() + x3 + x4.toLowerCase() + x5.toLowerCase() + x6; });
// Remove any capital letters that stand in isolation -- those are likely to be initials. Note that initials are
// identified as being uppercase letters followed by a period (with possible white space bracketing the period).
                     text = text.replace(/([\, ]+)((?:[A-Z] *\. *){1,5})(\,? *[12]{0,1})/g, function(x,x1,x2,x3) {
                         var tmp = '\,' + (x1+x2).slice(1).replace(/[ -~]/g,' ');
                         return tmp + x3.replace(/[^0-9]/g,' '); });
// OK, now filter the text big-time, removing everything except letters, numbers and commas
                     t = JSON.parse(filterTheText(/\,/.source, text));
// Now start looking for groups of characters that look like references within the text: Name,Name,Name2022,JournalName,000,00
// where 000,00 is the volume and page numbers, respectively
                     m = t[0].match(/^((?:(?:[A-Z][a-z]+\,){1,20}(?:[A-Z][a-z]+)?)|(?:[A-Z][a-z]+))(?:([12]\d\d\d[abc]{0,1})\,([A-Z][A-Za-z]{1,100})\,?(\d+)\,(\d+))/);
                     authors = [];
                     pubYear = '';
                     journal = '';
                     volume = '';
                     page = '';
                     if (m) {
// if the original reference is Smith, A. S., Jones, T. E., and Miller, W. D 2002, Astron. J., 145, 1
// the filtered view would be Smith,Jones,Miller,2002,AstronJ,145,1 (note that the "and" and the initials would have already been
// removed in a previous step above this "while" loop). Therefore, tmp will be (Smith,Jones,Miller)(2002)(AstronJ)(145)(1)
// extract the publication year:
                         pubYear = m[2].trim();
// extract the volume number:
                         volume = m[4];
// get the page numner:
                         page = m[5].replace(/[a-zA-Z]/g,''); // remove any "L" or other such designations, turn into pure number
// extract the journal name and convert into the journal abbreviation, but extract from the unfiltered text:
                         t1 = t[1][m[1].length + m[2].length - 1] + 1;
                         t2 = t[1][m[1].length + m[2].length + m[3].length -1] + 1;
                         journal = text.slice(t1,t2).replace(/[^A-Za-z0-9 ]/g,'').trim();
// determine what the full name is for this journal by consulting the xLtr's "journal" entries:
                         tmp = xLtr.reduce(function(x1,x2,x3) {
                               if (x2.type == "journal" && x2.abb !== undefined && x2.indx(journal,0) != "" &&
                                   parseFloat(x2.endMatch) > x1[1]) {x1 = [x3,parseFloat(x2.endMatch),x2.name.toLowerCase()];} return x1;}, [-1,-1,'']);
                         if (tmp[0] != -1 && tmp[1] == journal.length) { // perfect match!
                             journal = tmp[2].split(' ').join('\_'); }
// extract the individual authors' last names:
                         authors = m[1].replace(/\,/g,' ').replace(/  +/g,' ').trim().split(' ');
// Now that we have the author names and publication year, put together the citation likely to appear in the text
                         shortCit = '';
// Now create a  citation phrase... what this bibliography reference will likely look like in the text. For example, if the bibliography
// entry is Smith, A.K., Jones, Q. R., and Miller, D. R. 2010, ApJ, 545, 34, then the citation phrase might look like Smith et al 2010 or
// maybe Smith, Jones & Miller 2010. Use both formats just to be certain.
                         if (authors.length > 3) {
                             shortCit = authors[0] + 'etal' + pubYear;
                         } else if (authors.length == 3) {
                             shortCit = authors[0]+'etal'+pubYear+ '\|' +
                                        authors[0]+authors[1]+'and'+authors[2]+pubYear + '\|' +
                                        authors[0] + authors[1] + authors[2] + pubYear; // 3 possibilities
                         } else if (authors.length == 2) {
                             shortCit = authors[0] + 'and' + authors[1] + pubYear + '\|' +
                                        authors[0] + authors[1] + pubYear; // 2 possibilities
                         } else if (authors.length == 1) {
                             shortCit = authors[0] + pubYear;  }
                         pubYear = pubYear.replace(/[a-zA-Z]/g,'');
                         this.endMatch = '' +  (t[1][m[0].length-1] + 1 + startPos);
                         this.authors = ([... new Set(authors)]).sort().join('\_');
                         this.pubYear = ""+pubYear;
                         this.journal = journal;
                         this.volume = volume;
                         this.page = page;
                         return shortCit.toLowerCase();
                     } else {return ''; }
                  } });
       return;
   }
// ============================ end findBibRefs ===========================================


// ------------------------------ journalNames ------------------------------------------
//  %%%%%%%%%%%%%%%%%%%%%%%%  passed 4/22/2019
// big help: https://stackoverflow.com/questions/1234712/javascript-replace-with-reference-to-matched-group
// http://aramis.obspm.fr/~coulais/BibTeX/aas_macros.sty, https://cdsads.u-strasbg.fr/abs_doc/aas_macros.html
// The format for the journal name is to spell out the full name, and to capitalize
// the parts of the name that are "required" to be present for a match and/or that
// compose the abbreviation for that journal. Note that to get all possible realistic variations of
// a journal name, sometimes the journal name variations need to be explicitly stated as separate
// entries.  for example, "Astronomical Society of the Pacific" might be stated as simply
// ASP.  The code will match the "A" to Astronomical, the "S" to the "s" that comes right after
// the A in Astronomical, and the "P" gets matched to the P in Pacific.  The code will set match to
// "false", because the "S" in Society was not matched. To avoid this scenario, a second entry is
// needed that just states the ASP explicitly.
// Clean up the submitted name to be matched
   function journalNames() {
// read in the external file and split out the individual rows of data:
// See https://mirror.hmc.edu/ctan/macros/latex/contrib/mnras/mnras_guide.pdf regarding journal letters
// that have a designation of "L" in front of the page numbers.
      var lines = (GM_getResourceText("astroJournals").trim()).split('\n');
      var iLine = 0;
      var nextFields = [];
      var fields = []; // holds the columns of data for a particular line in the file
      var rWords = [];
      var xWords = '';
      var xSupp = '';
      var nChar = 0;
      var clipHere = [];
      var indexMatch = -1;
      var pubNames = [];
      var pubAbbrev = [];
      var pagePref = [];
      var matchArr = [];
      var i = -1;
      var j = -1;
      var k = -1;
      var prevMatch = '';
      var pubFull = '';
      var findPub = '';
      var eachWord = [];
      var tmp = '';
      var nLet = -1;
      var reqLet = '';
      var matchCnt = 0;
      var sp = '';
// clip out data table from any comments blocks
      clipHere = lines.reduce(function(x1,x2,x3) {if (x2.match(/\={20,}/)) {x1.push(x3);} return x1;}, []);
      if (clipHere.length >= 2) {
          lines = lines.slice(clipHere[0]+1,clipHere[1]);
      } else if (clipHere.length == 1) {
          lines = lines.slice(clipHere[0]+1); }
      while (iLine < lines.length) {
          lines[iLine] = (lines[iLine].trim().replace(/  +/g,' ')).trim(); // get rid of any repeated spaces
// split out each line in fileName.txt into separate columns/fields. Whitespace is the delimiter
          fields = lines[iLine].split(' ');
// Turn any field that is equal to just "|" into ""
          fields = fields.map(z => z.replace(/^\|$/,''));
// Clean up the full name (in case some undesirable characters were included):
          fields[0] = fields[0].replace(/\&/g, " and ").replace(/\./g, " ").replace(/\W/g, " ").replace(/\_/g, " ").trim();
// construct the regex.  Example:  if full name is "the Astronomical Journal", then the regex that will
// capture all possibilities without allowing false-positives is the following:
// ^(?:(?:the\s)|(?:th\s)|t\s)?a\s?(?:(?:stronomical\s)|(?:stronomica\s)|(?:stronomic\s)|(?:stronomi\s)|(?:stronom\s)|
// (?:strono\s)|(?:stron\s)|(?:stro\s)|(?:str\s)|(?:st\s)|s\s)?j\s?(?:(?:ournal\s)|(?:ourna\s)|(?:ourn\s)|(?:our\s)|
// (?:ou)|o)?$
          findPub = '';
// now start going thru each word in the full journal name. If the word has no required letters, then the entire
// word is optional and should end with a ?. If the word has required letters, allow the word to appear as
// illustrated in the following example for AstroPhysics:
//      Astrophysics, Astrophysic, Astrophysi, Astrophys, Astrophy, Astroph, Astrop, Ap
// Note that we start dropping letters at the end up to the first required letter
// encoutered, and then the only additional allowed combo would be the required letters only
          eachWord = fields[0].split(" ");
          for (j = 0; j < eachWord.length; j++) {
              sp = / /.source;
              if (j == eachWord.length -1) {sp = '';}
              tmp = '';
              reqLet = '';
              for (k = eachWord[j].length; k > 0; k--) {
                  if (eachWord[j].charAt(k-1) === eachWord[j].charAt(k-1).toUpperCase()) {
                      reqLet = eachWord[j].charAt(k-1).toLowerCase() + reqLet;}
                  if (!reqLet && k > 1) {
                      tmp = tmp + '(?:' + eachWord[j].substr(0,k).toLowerCase() + sp + ')|';
                  } else if (!reqLet && k == 1) {
                      tmp = '(?:' + tmp + eachWord[j].charAt(0).toLowerCase() + sp + ')?';}
// once you hit the first required letter from the right side of the word, then you
// stop building the regex, but continue collecting any remaining required letters in
// the word:
              }
              if (sp) {sp = sp + '?';}
              if (reqLet.length > 1) {
                  tmp = '(?:' + tmp + '(?:' + reqLet.toLowerCase() + sp + '))';
              } else if (reqLet) {
                  tmp = '(?:' + tmp + reqLet.toLowerCase() + sp + ')'; }
              findPub = findPub + tmp;
          }
          xLtr.push({"reg":findPub, "type":"journal", "priority":"1",
                     "name":fields[0], "abb": fields[1], "pagePref": fields[2],
                     "indx":function(text, startPos) {
                        this.endMatch = "-1";
                        text = text.toLowerCase();
                        t = JSON.parse(filterTheText(this.reg, text));
                        m = t[0].match(new RegExp('\^' + this.reg));
                        if (m) {
// found a match to the journal name
                            this.endMatch = t[1][m[0].length-1] + 1 + startPos;
// return the full journal name (the abbreviation and page pref are accessible via the provided field names)
                            return this.name.toLowerCase();
                        } else {return ""; } }})
          iLine = iLine + 1;
      }
      return;
   }

// ---------------------------  end journalAbbrev --------------------------------------

// ============ COORDINATES ==================
//  %%%%%%%%%%%%%%%%%%%%%%%%  passed 3/12/2019
  function coordinates() {
// If the coordinates were originally written with colons, insure that the whole numbers
// have preceding zeros to make them be 2-digit values:
// NOTE: we do not filter the text to at least eliminate white space as we do for
// other technical terms because the presence of white space delineating the ra and dec
// in the absence of a "+" or "-" is essential in recognizing the text as a coordinate
     // ------------------  (14)( : 5)( :  45)( . 876566)(  )(76)( : 2)( :  15)( . 1234)
      xLtr.push({"reg": (new RegExp([
                       /(^(?:(?:[0-1][0-9])|(?:[0-9](?![0-9]))|(?:2[0-3])))/,  // (14)         1
                       /( *\: *(?:(?:[0-5][0-9])|(?:[0-9](?![0-9]))))/,      // ( : 5)       2
                       /( *\: *(?:(?:[0-5][0-9])|(?:[0-9](?![0-9]))))?/,     // ( : 45)      3 ?
                       /( *\. *[0-9]+)?/,                                    // ( . 876566)  4 ?
                       /( +[\+\-]{0,1} *)/,                                  // ( )          5
                       /((?:(?:[0-8][0-9])|(?:[0-9](?![0-9]))))/,              // (76)         6
                       /( *\: *(?:(?:[0-5][0-9])|(?:[0-9](?![0-9]))))/,      // ( : 2)       7
                       /( *\: *(?:(?:[0-5][0-9])|(?:[0-9](?![0-9]))))?/,     // ( :  15)     8 ?
                       /( *\. *[0-9]+)?/                                     // ( . 1234)    9 ?
                          ].map(z => z.source).join(''))).source,
                "nChars":"21", "type":"ra", "priority":"1", "x":"", "xSupp":"", "nVals":"2",
                "indx":function(text, startPos) {
                    this.endMatch = "-1";
                    var m = text.slice(startPos).match(new RegExp('^' + '(?:' + this.reg + ')'));
                    if (m) {
                        this.endMatch = ""+(startPos + m[0].length);
                        var tmp = extractRaDecVals(this.reg, text.slice(startPos));
                        this.accuracy = tmp[2];
                        return tmp[0];
                    } else {return ''; } } });
      xLtr.push({"reg": (new RegExp([
                       /(^(?:(?:[0-1][0-9])|(?:[0-9](?![0-9]))|(?:2[0-3])))/,  // (14)         1
                       /( *\: *(?:(?:[0-5][0-9])|(?:[0-9](?![0-9]))))/,      // ( : 5)       2
                       /( *\: *(?:(?:[0-5][0-9])|(?:[0-9](?![0-9]))))?/,     // ( : 45)      3 ?
                       /( *\. *[0-9]+)?/,                                    // ( . 876566)  4 ?
                       /( +[\+\-]{0,1} *)/,                                  // ( )          5
                       /((?:(?:[0-8][0-9])|(?:[0-9](?![0-9]))))/,              // (76)         6
                       /( *\: *(?:(?:[0-5][0-9])|(?:[0-9](?![0-9]))))/,      // ( : 2)       7
                       /( *\: *(?:(?:[0-5][0-9])|(?:[0-9](?![0-9]))))?/,     // ( :  15)     8 ?
                       /( *\. *[0-9]+)?/                                     // ( . 1234)    9 ?
                          ].map(z => z.source).join(''))).source,
                "nChars":"21", "type":"dec", "priority":"1", "x":"", "xSupp":"", "nVals":"2",
                "indx":function(text, startPos) {
                    this.endMatch = "-1";
                    var m = text.slice(startPos).match(new RegExp('^' + '(?:' + this.reg + ')'));
                    if (m) {
                        this.endMatch = ""+(startPos + m[0].length);
                        var tmp = extractRaDecVals(this.reg, text.slice(startPos));
                        this.accuracy = tmp[3];
                        return tmp[1];
                    } else {return ''; } } });
     // ------------------  (04 hr)( 3 min)( 1 sec)( . 345  )(  )(77 deg)( 35 min)( 5 sec)( . 11 )
     xLtr.push({"reg": (new RegExp([
                      /(^(?:(?:[0-1][0-9])|(?:[0-9](?![0-9]))|(?:2[0-3])) *(?:(?:hours)|(?:hour)|(?:hrs)|(?:hr)|(?:h)))/,                   // (04 hr)    1
                      /( *(?:(?:[0-5][0-9])|(?:[0-9](?![0-9]))) *(?:(?:minutes)|(?:minute)|(?:mins)|(?:min)|(?:m))?)/,                     // ( 3 min?)  2
                      /( *(?:(?:[0-5][0-9])|(?:[0-9](?![0-9]))) *(?:(?:seconds)|(?:second)|(?:sec)|(?:s))?)?/,                             // ( 1 sec)   3 ?
                      /( *(?:\. *[0-9]+)? *(?:(?:minutes)|(?:minute)|(?:mins)|(?:min)|(?:m)|(?:seconds)|(?:second)|(?:sec)|(?:s)))?/,     // ( . 345)   4 ?
                      /( *[\+\-]{0,1}) */,                                                                                                 // (  )       5
                      /((?:(?:[0-8][0-9])|(?:[0-9](?![0-9]))) *(?:(?:textdegree)|(?:circ)|(?:degrees)|(?:degree)|(?:degs)|(?:deg)|(?:d)))/, // (77 deg)   6
                      /( *(?:(?:[0-5][0-9])|(?:[0-9](?![0-9]))) *(?:(?:minutes)|(?:minute)|(?:mins)|(?:min)|(?:m))?)/,                     // ( 35 min?) 7
                      /( *(?:(?:[0-5][0-9])|(?:[0-9](?![0-9]))) *(?:(?:seconds)|(?:second)|(?:sec)|(?:s))?)?/,                             // ( 5 sec)   8 ?
                      /( *(?:\. *[0-9]+)? *(?:(?:minutes)|(?:minute)|(?:mins)|(?:min)|(?:m)|(?:seconds)|(?:second)|(?:sec)|(?:s)))?/      // ( . 11 )   9 ?
                         ].map(z => z.source).join(''))).source,
                "nChars":"34", "type":"ra", "priority":"1", "x":"", "xSupp":"", "nVars":"2",
                "indx":function(text, startPos) {
                    this.endMatch = "-1";
                    var m = text.slice(startPos).match(new RegExp('^' + '(?:' + this.reg + ')'));
                    if (m) {
                        this.endMatch = ""+(startPos + m[0].length);
                        var tmp = extractRaDecVals(this.reg, text.slice(startPos));
                        this.accuracy = tmp[2];
                        return tmp[0];
                    } else {return ''; } } });
     xLtr.push({"reg": (new RegExp([
                      /(^(?:(?:[0-1][0-9])|(?:[0-9](?![0-9]))|(?:2[0-3])) *(?:(?:hours)|(?:hour)|(?:hrs)|(?:hr)|(?:h)))/,                   // (04 hr)    1
                      /( *(?:(?:[0-5][0-9])|(?:[0-9](?![0-9]))) *(?:(?:minutes)|(?:minute)|(?:mins)|(?:min)|(?:m))?)/,                     // ( 3 min?)  2
                      /( *(?:(?:[0-5][0-9])|(?:[0-9](?![0-9]))) *(?:(?:seconds)|(?:second)|(?:sec)|(?:s))?)?/,                             // ( 1 sec)   3 ?
                      /( *(?:\. *[0-9]+)? *(?:(?:minutes)|(?:minute)|(?:mins)|(?:min)|(?:m)|(?:seconds)|(?:second)|(?:sec)|(?:s)))?/,     // ( . 345)   4 ?
                      /( *[\+\-]{0,1}) */,                                                                                                 // (  )       5
                      /((?:(?:[0-8][0-9])|(?:[0-9](?![0-9]))) *(?:(?:textdegree)|(?:circ)|(?:degrees)|(?:degree)|(?:degs)|(?:deg)|(?:d)))/, // (77 deg)   6
                      /( *(?:(?:[0-5][0-9])|(?:[0-9](?![0-9]))) *(?:(?:minutes)|(?:minute)|(?:mins)|(?:min)|(?:m))?)/,                     // ( 35 min?) 7
                      /( *(?:(?:[0-5][0-9])|(?:[0-9](?![0-9]))) *(?:(?:seconds)|(?:second)|(?:sec)|(?:s))?)?/,                             // ( 5 sec)   8 ?
                      /( *(?:\. *[0-9]+)? *(?:(?:minutes)|(?:minute)|(?:mins)|(?:min)|(?:m)|(?:seconds)|(?:second)|(?:sec)|(?:s)))?/      // ( . 11 )   9 ?
                         ].map(z => z.source).join(''))).source,
                "nChars":"34", "type":"dec", "priority":"1", "x":"", "xSupp":"", "nVars":"2",
                "indx":function(text, startPos) {
                    this.endMatch = "-1";
                    var m = text.slice(startPos).match(new RegExp('^' + '(?:' + this.reg + ')'));
                    if (m) {
                        this.endMatch = ""+(startPos + m[0].length);
                        var tmp = extractRaDecVals(this.reg, text.slice(startPos));
                        this.accuracy = tmp[3];
                        return tmp[1];
                    } else {return ''; } } });
     // ------------------  (14)(  5)(   45)( . 876566)( +)(76)( 2)(  15)( . 1234)
     xLtr.push({"reg": (new RegExp([
                      /(^(?:(?:[0-1][0-9])|(?:[0-9](?![0-9]))|(?:2[0-3])))/, // (14)        1
                      /( +(?:(?:[0-5][0-9])|(?:[0-9](?![0-9]))))/,          // ( 5)        2
                      /( +(?:(?:[0-5][0-9])|(?:[0-9](?![0-9]))))?/,         // (  45)      3 ?
                      /( *\. *[0-9]+)?/,                                   // ( . 876566) 4 ?
                      /( +[\+\-]{0,1} *)/,                                 // ( +)        5
                      /((?:[0-8][0-9])|(?:[0-9](?![0-9])))/,                 // (76)        6
                      /( +(?:(?:[0-5][0-9])|(?:[0-9](?![0-9]))))/,          // ( 2)        7
                      /( +(?:(?:[0-5][0-9])|(?:[0-9](?![0-9]))))?/,         // (  15)      8 ?
                      /( *\. *[0-9]+)?/                                    // ( . 1234)   9 ?
                         ].map(z => z.source).join(''))).source,
                "nChars":"18", "type":"ra", "priority":"1", "x":"", "xSupp":"", "nVars":"2",
                "indx":function(text, startPos) {
                    this.endMatch = "-1";
                    var m = text.slice(startPos).match(new RegExp('^' + '(?:' + this.reg + ')'));
                    if (m) {
                        this.endMatch = ""+(startPos + m[0].length);
                        var tmp = extractRaDecVals(this.reg, text.slice(startPos));
                        this.accuracy = tmp[2];
                        return tmp[0];
                    } else {return ''; } } });
     xLtr.push({"reg": (new RegExp([
                      /(^(?:(?:[0-1][0-9])|(?:[0-9](?![0-9]))|(?:2[0-3])))/, // (14)        1
                      /( +(?:(?:[0-5][0-9])|(?:[0-9](?![0-9]))))/,          // ( 5)        2
                      /( +(?:(?:[0-5][0-9])|(?:[0-9](?![0-9]))))?/,         // (  45)      3 ?
                      /( *\. *[0-9]+)?/,                                   // ( . 876566) 4 ?
                      /( +[\+\-]{0,1} *)/,                                 // ( +)        5
                      /((?:[0-8][0-9])|(?:[0-9](?![0-9])))/,                 // (76)        6
                      /( +(?:(?:[0-5][0-9])|(?:[0-9](?![0-9]))))/,          // ( 2)        7
                      /( +(?:(?:[0-5][0-9])|(?:[0-9](?![0-9]))))?/,         // (  15)      8 ?
                      /( *\. *[0-9]+)?/                                    // ( . 1234)   9 ?
                         ].map(z => z.source).join(''))).source,
                "nChars":"18", "type":"dec", "priority":"1", "x":"", "xSupp":"", "nVars":"2",
                "indx":function(text, startPos) {
                    this.endMatch = "-1";
                    var m = text.slice(startPos).match(new RegExp('^' + '(?:' + this.reg + ')'));
                    if (m) {
                        this.endMatch = ""+(startPos + m[0].length);
                        var tmp = extractRaDecVals(this.reg, text.slice(startPos));
                        this.accuracy = tmp[3];
                        return tmp[1];
                    } else {return ''; } } });
    // ------------------  (14)(05)(45)(.876566)(-)(76)(15)(.1234)   ===> '14:05:45.876556-76:15.1234'
     xLtr.push({"reg": (new RegExp([
                      /(^(?:(?:[0-1][0-9])|(?:2[0-3])))/,          // (14)      1
                      /([0-5][0-9])/,                              // (05)      2
                      /([0-5][0-9])?/,                             // (45)      3 ?
                      /(\.[0-9]+)?/,                               // (.876566) 4 ?
                      /([\+\-])/,                                  // (-)       5
                      /([0-8][0-9])/,                              // (76)      6
                      /([0-5][0-9])/,                              // (15)      7
                      /([0-5][0-9])?/,                             // ()        8
                      /(\.[0-9]+)?/                                // (.1234)   9 ?
                         ].map(z => z.source).join(''))).source,
                "nChars":"18", "type":"ra", "priority":"1", "x":"", "xSupp":"", "nVars":"2",
                "indx":function(text, startPos) {
                    this.endMatch = "-1";
                    var m = text.slice(startPos).match(new RegExp('^' + '(?:' + this.reg + ')'));
                    if (m) {
                        this.endMatch = ""+(startPos + m[0].length);
                        var tmp = extractRaDecVals(this.reg, text.slice(startPos));
                        this.accuracy = tmp[2];
                        return tmp[0];
                    } else {return ''; } } });
     xLtr.push({"reg": (new RegExp([
                      /(^(?:(?:[0-1][0-9])|(?:2[0-3])))/,          // (14)      1
                      /([0-5][0-9])/,                              // (05)      2
                      /([0-5][0-9])?/,                             // (45)      3 ?
                      /(\.[0-9]+)?/,                               // (.876566) 4 ?
                      /([\+\-])/,                                  // (-)       5
                      /([0-8][0-9])/,                              // (76)      6
                      /([0-5][0-9])/,                              // (15)      7
                      /([0-5][0-9])?/,                             // ()        8
                      /(\.[0-9]+)?/                                // (.1234)   9 ?
                         ].map(z => z.source).join(''))).source,
                "nChars":"18", "type":"dec", "priority":"1", "x":"", "xSupp":"", "nVars":"2",
                "indx":function(text, startPos) {
                    this.endMatch = "-1";
                    var m = text.slice(startPos).match(new RegExp('^' + '(?:' + this.reg + ')'));
                    if (m) {
                        this.endMatch = ""+(startPos + m[0].length);
                        var tmp = extractRaDecVals(this.reg, text.slice(startPos));
                        this.accuracy = tmp[3];
                        return tmp[1];
                    } else {return ''; } } });
     return;
  }
// - - - - - - - - EXTRACTRADECVALS - - - - - - -  -
//  %%%%%%%%%%%%%%%%%%%%%%%%  passed 3/12/2019
  function extractRaDecVals(reg,txt) {
     var charPos = [];
     var raDeg, decDeg;
     var r1, r2, r3, d1, d2, d3,s;
     var r2Acc,r3Acc,d2Acc,d3Acc;
     var raAcc,decAcc;
     var findMatch = txt.match(new RegExp(reg));
     if (findMatch) {
         r1 = findMatch[1].replace(/[^0-9]/g,'');
         r2 = findMatch[2].replace(/[^0-9]/g,'');
         r2Acc = 0.5;
         r3 = '';
         if (findMatch[3]) {
             r3Acc = 0.5;
             r3 = findMatch[3].replace(/[^0-9]/g,''); }
         if (findMatch[4] && r3 != '') {
             r3Acc = Math.pow(10,-1.0*(findMatch[4].replace(/[^0-9]/g,'').length));
             r3 = r3 + findMatch[4].replace(/[^0-9\.]/g,'');
         } else if(findMatch[4]) {
             r2Acc = Math.pow(10,-1.0*(findMatch[4].replace(/[^0-9]/g,'').length));
             r2 = r2 + findMatch[4].replace(/[^0-9\.]/g,'');  }
         if (r3 == '') {r3 = '0'; }
         s = 1;
         if (findMatch[5].replace(/[^+-]/g,'') == '-') {s = -1; }
         d1 = findMatch[6].replace(/[^0-9]/g,'');
         d2 = findMatch[7].replace(/[^0-9]/g,'');
         d2Acc = 0.5;
         d3 = '';
         if (findMatch[8]) {
             d3Acc = 0.5;
             d3 = findMatch[8].replace(/[^0-9]/g,''); }
         if (findMatch[9] && d3 != '') {
             d3Acc = Math.pow(10,-1.0*(findMatch[9].replace(/[^0-9]/g,'').length));
             d3 = d3 + findMatch[9].replace(/[^0-9\.]/g,'');
         } else if (findMatch[9]) {
             d2Acc = Math.pow(10,-1.0*(findMatch[9].replace(/[^0-9]/g,'').length));
             d2 = d2 + findMatch[9].replace(/[^0-9\.]/g,'');  }
         if (d3 == '') {d3 = '0'; }
         raDeg = ((parseFloat(r1) + parseFloat(r2)/60 + parseFloat(r3)/3600) * 360/24).toFixed(5);
         decDeg = (s*(parseFloat(d1) + parseFloat(d2)/60 + parseFloat(d3)/3600)).toFixed(5);
         if (r3Acc) {
             raAcc = (r3Acc*(360/(24*3600))).toFixed(5);
         } else {
             raAcc = (r2Acc*(360/(24*60))).toFixed(5); }
         if (d3Acc) {
             decAcc = (d3Acc/3600).toFixed(5);
         } else {
             decAcc = (d2Acc/60).toFixed(5); }
         return [raDeg, decDeg, raAcc, decAcc, findMatch[0]];
     } else {return ["","","","",""]; }
  }
// - - - - - - - - end EXTRACTRADECVALS - - - - -
// ============ end COORDINATES ==================
// ================= READINFILE =====================
//  %%%%%%%%%%%%%%%%%%%%%%%%  passed 3/12/2019
// This function reads in a file used to build the xLtr and not requiring special handling. The
// file must follow a specific format: Column 1 is the word to actually appear in the index (can be
// multiple words grouped in phrases where the words are delimited by "_" or can be multiple
// independent words or phrases delimited from each other by "|"), Column 2 are the characters to
// be looked for in text and then essentially replaced by all the words in Column 1 (the words in column
// 2 can be multiple words in phrases separated by "_" or multiple independent words or phrases delimited
// by "|"), Column 3 are words/phrases for which the words in Column 1 will appear as the .x field,
// and Column 4 are words/phrases that will appear as the .x field for the words in Column 1.  Columns 3 and
// 4 can be left empty (indicated by a lone "|"), and words in any of the columns can be wrapped
// around/continued to the next line by ending the words/phrases with either a "_" or a "|" (depending
// on if wrapping is in middle of phrase or at end of a phrase/lone word, resp.) and continuing that phrase or
// the next phrase/word in the next column. The fields of data are then loaded up into the xLtr. If
// more logic than the above is needed, then a special function will be required and readInFile will not
// be called.
  function readInFile(fileName, priority, wordType) {
     var j = 0;
     var k = 0;
     var iLine = 0;
     var nextFields = [];
     var fields = []; // holds the columns of data for a particular line in the file
     var rWords = [];
     var xWords = '';
     var xSupp = '';
     var nChar = 0;
     var clipHere = [];
// read in the external file and split out the individual rows of data:
     var lines = (GM_getResourceText(fileName).trim()).split('\n');
// clip out data table from any comments blocks
     clipHere = lines.reduce(function(x1,x2,x3) {if (x2.match(/\={20,}/)) {x1.push(x3);} return x1;}, []);
     if (clipHere.length >= 2) {
         lines = lines.slice(clipHere[0]+1,clipHere[1]);
     } else if (clipHere.length == 1) {
         lines = lines.slice(clipHere[0]+1); }
     while (iLine < lines.length) {
         lines[iLine] = (lines[iLine].trim().replace(/  +/g,' ')).trim(); // get rid of any repeated spaces
// split out each line in fileName.txt into separate columns/fields. Whitespace is the delimiter
         fields = lines[iLine].split(' ');
// Turn any field that is equal to just "|" into ""
         fields = fields.map(z => z.replace(/^\|$/,''));
// Now look at the last character of each column and see if any is a vertical bar or underscore.  If so, then this line
// continues on to the next line.
         tmp = fields.reduce(function(x1,x2,x3) {if (x2.match(/[\|\_]$/)) {x1.push(x3);} return x1;}, []);
         while (tmp.length > 0) {
// yep, need to get the next line
            iLine = iLine + 1;
            lines[iLine] = (lines[iLine].trim().replace(/  +/g,' ')).trim();
            nextFields = lines[iLine].split(' ');
            nextFields = nextFields.filter(z => z != "\|");
            if (tmp.length == nextFields.length) { // continuations need to match up between lines
                for (k= 0; k < tmp.length; k++) {fields[tmp[k]] = fields[tmp[k]] + nextFields[k]; }
                tmp = fields.reduce(function(x1,x2,x3) {if (x2.match(/[\|\_]$/)) {x1.push(x3);} return x1;}, []);
            } else {tmp = []; }
         }
// At this point, the entire line (including continuations) have been read in and the columns of data in
// this line put into "fields"
//
// Construct the xLtr so that there is a unique "reg" word (each word in Column 2), with its associated "indx" words
// (each word in Column 1, delimited by a "_"  if on the same line), along with any words (COLUMN 3) for which Column 1 content
// is to be for the ".x" extended search field, and any words that are to be the .x extended search field content
// for this reg (COLUMN 4).
         xWords = '';
         xSupp = '';
         fields[1] = fields[1].replace(/\_/g,''); // ignore any underscores
         rWords = [... new Set(fields[1].split('\|'))]; // split out all the "reg" words
// put these into the .x field of this reg entry
         if (fields.length > 3 && fields[3] != '') {xWords = fields[3]; }
         if (fields.length > 2 && fields[2] != '') {xSupp = fields[0] + 'X4' + fields[2]; }
         for (j = 0; j < rWords.length; j++) {
             nChar = getNchars(rWords[j]);
// Has this "reg" already been put into the xLtr?
             k = xLtr.findIndex(z => z.reg !== undefined && z.reg == rWords[j]);
             if (k == -1) {
                xLtr.push({
                   "reg":rWords[j], "nChars":''+nChar, "priority":''+priority, "type":wordType,
                   "tIndx":fields[0], "x":xWords, "xSupp":xSupp,
                   "indx":function(text, startPos) {
                       this.endMatch = "-1";
                       var m;
                       var t = JSON.parse(filterTheText(this.reg, text.slice(startPos)));
// if the word explicitly contains capitalized letters, then any match must also have those
// capital letters.  If the word has lower case letters, the match can have the first
// letter captialized if it is at the beginning of a sentence, otherwise no match.
                       if (this.reg.match(/[A-Z]/)) {
                           m = t[0].match(new RegExp('^'+'(?:'+this.reg+')'));
                       } else {
                           m = t[0].match(new RegExp('^'+'(?:'+this.reg+')'),'i'); }
                       var endMatch = -1;
                       var rightTst = false;
                       var leftTst = false;
                       var middleTst = true;
                       var capTst = true;
                       if (m) {
                           endMatch = t[1][m[0].length-1] + 1 + startPos;
// make sure that this is not a false-positive:  if the word is less than 5 characters long,
// insure that there is a non-alphanumeric character on the right and left side of it in
// the unfiltered version of the text.
                           if (m[0].length <= 5 && startPos > 0 && text.charAt(startPos-1).match(/[^A-Za-z0-9]/)) {
                               leftTst = true;  }
                           if (startPos == 0) {leftTst = true; }
                           if (m[0].length > 5) {leftTst = true;}
                           if (m[0].length <= 5 && text.length >= endMatch+1 && text.charAt(endMatch).match(/[^A-Za-z0-9]/)) {
                               rightTst = true; }
                           if (text.length < endMatch+1) {rightTst = true; }
                           if (m[0].length > 5) {rightTst = true; }
                           if (this.reg.match(/[^A-Z]/) && m[0].match(/[A-Z]/) && m[0].match(/[A-Z]/).length > 1) {capTst = false;}
                           if (this.reg.match(/[^A-Z]/) && m[0].match(/[A-Z]/) && m[0].match(/^[a-z0-9]/)) {capTst = false; }
// Now check the characters between the first and last matched character to see if there is evidence
// of sentence breaks and other characters that should not appear in the middle of real words:
                           if (text.slice(startPos, endMatch).match(/\. +[A-Z]/) && (!(m[0].match(/\. +[A-Z]/)))) {middleTst = false; }
                           if (text.slice(startPos, endMatch).match(/\;/) && (!(m[0].match(/\; +[A-Z]/)))) {middleTst = false; }
                           if (text.slice(startPos, endMatch).match(/\,/) && (!(m[0].match(/\, +[A-Z]/)))) {middleTst = false; }
                           if (text.slice(startPos, endMatch).match(/\:/) && (!(m[0].match(/\: +[A-Z]/)))) {middleTst = false; }
                           if (text.slice(startPos, endMatch).match(/\?/) && (!(m[0].match(/\? +[A-Z]/)))) {middleTst = false; }
                           if (text.slice(startPos, endMatch).match(/\!/) && (!(m[0].match(/\! +[A-Z]/)))) {middleTst = false; }
                           if (text.slice(startPos, endMatch).match(/\(/) && (!(m[0].match(/\( +[A-Z]/)))) {middleTst = false; }
                           if (text.slice(startPos, endMatch).match(/\)/) && (!(m[0].match(/\) +[A-Z]/)))) {middleTst = false; }
                           if (text.slice(startPos, endMatch).match(/\[/) && (!(m[0].match(/\[ +[A-Z]/)))) {middleTst = false; }
                           if (text.slice(startPos, endMatch).match(/\]/) && (!(m[0].match(/\] +[A-Z]/)))) {middleTst = false; }
                       }
// Note that we don't test for curly brackets, as they may be present as part of latex markup
// If all the tests come back OK, then we've got a legit match:
                       if (!(leftTst*rightTst*middleTst*capTst)) {return ""; }
                       this.endMatch = ""+endMatch;
                       return this.tIndx; }  });
             } else {
// an entry for this "reg" already exists, so just append any additional information to the "x", "indx" and "xSupp" fields:
                xLtr[k].xSupp = (([... new Set(((xLtr[k].xSupp + ' ' + xSupp).trim()).split(' '))]).join(' ')).trim();
                xLtr[k].tIndx = ([... new Set(((xLtr[k].tIndx + '\|' + fields[0]).trim()).split('\|'))]).join('\|');
                xLtr[k].x = ([... new Set(((xLtr[k].x + '\|' + xWords).replace(/^\|/,'').replace(/\|$/,'')).split('\|'))]).join('\|');
             }
         }
         iLine = iLine + 1;
     }
     return;
  }
// =============== end READINFILE===================
// =============== COMMONLINES ===================
 function commonLines() {
// reads in an external file of common spectral lines, for the sole purpose of comparing to lines found in the text so
// that additional information (like common names for those lines, such as Balmer, H-alpha, etc) can be added to the
// "extended search" field (.x) in the xLtr.  Also, the common lines serve the purpose of helping to identify spec lines
// listed in the text by only their symbol and wavelength (or frequency) value. The structure of this file is:
// COLUMN 1: full symbol element (like "[NeII]") Note: if ionization level listed as "I", then a separate
// version using just the plain element symbol will also be constructed as a separate entry in the xLtr, COLUMN 2: value of
// wavelength or frequency or energy of the line emission, COLUMN 3: the uncertainty (plus/minus) allowed in a value to be
// considered a match to this line's wavelength/freq/energy value, COLUMN 4: unit of value listed in column 2,
// COLUMN 5: all the alternative names for this spectral feature. Multiple names delimited by a vertical bar.  If there are
// no alternative names (like "lymanalpha"), just a bar appears.  Each of the names that appear here will be the regexp
// for separate entries in the xLtr, all having the same line information and word under which the info should be
// indexed being the same (e.g., like HIL1.888), COLUMN 6: words (delimited by vertical bars, phrases with words delimited
// by underscore) that, in their extended fields (".x") of xLtr, should list this spectral line, COLUMN 7: words
// (delimited by vertical bars, words in phrases delimited by underscores) that should appear in the
// "extended" field (e.g, the ".x") of xLtr for this line.  These words are words that, if an extended search is desired later, would
// be included in the search of the index because they are either directly or indirectly related to the words for which they
// appear.  For example, if the spectral line is part of a doublet, then the other line might be listed here.
// In Columms 6-7, words that are part of a phrase should be delimited by an underscore, eg "fine_structure", and separate
// words or phrases delimited by vertical bar, eg "fine_structure|collisional_excitation|doublet".  The nuances of this
// format are important:  by putting words together in a single phrase (e.g., delimiting those words with underscores), you
// are instructing the index-searcher to  require those words to appear close together in proximity to each other (e.g., like
// in the same sentence). Search results for fine_structure|collisional_excitation|doublet would be a subset of the results from
// fine|structure|collisional|excitation|doublet. If these words are included in the ".x" field of the xLtr array object, then these
// words and phrases would automatically be included in the search if the "extended search mode" was activated.
    var clipHere = 0;
    var lines = (GM_getResourceText("commonLines").trim()).split('\n');
 // clip out data table from any comments blocks
    clipHere = lines.reduce(function(x1,x2,x3) {if (x2.match(/\={20,}/)) {x1.push(x3); } return x1; }, []);
    if (clipHere.length >= 2) {
        lines = lines.slice(clipHere[0]+1,clipHere[1]);
    } else if (clipHere.length == 1) {
        lines = lines.slice(clipHere[0]+1); }
    var i = 0;
    var j = 0;
    var k = 0;
    var info = '';
    var regArr = [];
    var columns = [];
    var symArr = [];
    var energyArr = [];
    var unitArr = [];
    var xArr = [];
    var xsArr = [];
    var vDelArr = [];
    var eDelArr = [];
    var valArr = [];
    var wfeArr= [];
    var regArr = [];
    var thisIndx = '';
    var thisX = '';
    var thisXs = '';
    var reg = '';
// Go through the file, line by line, and generate 4 arrays that store Column 1, Column 2,
// Column 4 and the corresponding energy, respectively:
    for (i = 0; i < lines.length; i++) {
        lines[i] = lines[i].replace(/  +/g,' ').trim();
        columns = (lines[i].split(' ')).map(z => z.replace(/^\|$/,'')); // turn a lone "|" into ""
// compute the corresponding energy of the emission line represented by COLUMNS1-2:
        symArr.push(columns[0]);
        valArr.push(columns[1]);
        unitArr.push(columns[3]);
        vDelArr.push(columns[2]);
        regArr.push(columns[4]);
        xArr.push(columns[6]);
        info = JSON.parse(extractLineEnergy(columns[1], columns[3], columns[2]));
        energyArr.push(info[0]);
        eDelArr.push(info[1]);
        xsArr.push( (columns[5] + '\|' + info[2]).replace(/^\|/,'').replace(/\|$/,''));
        wfeArr.push(info[3]);
    }
// If there are any mentions of column 1 items in columns 6-7, replace with the associated energy:
    for (i = 0; i < xArr.length; i++) {
        for (j = 0; j < symArr.length; j++) {
             xArr[i] = xArr[i].replace(symArr[j]+valArr[j]+unitArr[j], energyArr[j]);
             xsArr[i] = xsArr[i].replace(symArr[j]+valArr[j]+unitArr[j], energyArr[j]); }
    }
// Now construct the linelist entries for the xLtr.  Note that these entries will not have a "reg"
// as they will be for look-up purposes only to provide supplemental information (like the .x and
// .xSupp fields) to the "spectralLine" xLtr entries, not to be used directly to match text directly.
    for (i = 0; i < xArr.length; i++) {
// To extract all information associated with this line, the type=spectralLine entries of the xLtr
// will be searched for matches to the symbol+value+unit combinations to obtain all the
// information associated with that spectral feature.
         k = xLtr.findIndex(z => z.reg !== undefined && z.waveFreqPos !== undefined && z.indx(symArr[i]+valArr[i]+unitArr[i], 0, false) != '');
 // by definition, there must be a match, given that the templates cover all possibilities:
        thisIndx = xLtr[k].indx(symArr[i] + valArr[i] + unitArr[i], 0, false);
        thisX = (xArr[i] + '\|' + xLtr[k].x).replace(/^\|/,'').replace(/\|$/,'');
        thisX = ([... new Set(thisX.split('\|'))]).join('\|');
        if (xLtr[k].xSupp != '') {thisXs = xLtr[k].xSupp; }
        if (xsArr[i] != '') {
            thisXs = (energyArr[i]+'X4'+xsArr[i] + " " + thisXs).trim();
            thisXs = (([... new Set(thisXs.split(" "))]).join(' ')).trim();  }
        xLtr.push({"symbol":symArr[i], "type":"lineList", "wfeValue":valArr[i], "wfeDelta":vDelArr[i],
                   "wfeUnits":unitArr[i], "energy":energyArr[i], "energyDelta":eDelArr[i],
                   "region":regArr[i], "waveFreq":wfeArr[i], "x":thisX, "xSupp":thisXs, "indx":thisIndx});
// Now go through and for each individual word in Column 5, make a new xLtr entry with that word as the
// "reg".  These entries WILL be used directly to match to text, just as if "reg" were a jargon word. These
// "reg" words are alternative words for some of the spectral lines, like "h-alpha" instead of HI 6563.
        reg = regArr[i].replace(/[\|\_]/g,'\|').split('\|');
        for (j = 0; j < reg.length; j++) {
            reg[j] = reg[j].trim();
            nChar = reg[j].length;
// for some reason, even when regArr[i] is a null string, reg.length = 1 and the below executes. Put
// in a fix to stop that behavior here:
            if (reg[j] != '') {
// if the reg[j] has a capitalized letter, but the length of the total word is longer than 3 characters,
// change the reg[j] to all lowercase.  If only 3 characters or less, need to preserve the capilization
// in order to decrease the chances of a false positive match.
               if (reg[j].length > 3) {reg[j] = reg[j].toLowerCase(); }
               xLtr.push({"reg":reg[j].replace(/^\*/,''), "nChars":''+nChar, "priority":"1",
                          "type":"namedLine", "tIndx":thisIndx, "x":thisX, "xSupp":thisXs,
                          "indx":function(text, startPos) {
                               this.endMatch = "-1";
                               var m;
                               var t = JSON.parse(filterTheText(this.reg, text.slice(startPos)));
                               if (this.reg.match(/[A-Z]/)) {
                                    m = t[0].match(new RegExp('^'+'(?:'+this.reg+')'));
                               } else {
                                    m = t[0].match(new RegExp('^'+'(?:'+this.reg+')'),'i'); }
                               var endMatch = -1;
                               var rightTst = false;
                               var leftTst = false;
                               var middleTst = true;
                               var capTst = true;
                               if (m) {
                                   endMatch = t[1][m[0].length-1] + 1 + startPos;
// make sure that this is not a false-positive:  if the word is less than 5 characters long,
// insure that there is a non-alphanumeric character on the right and left side of it in
// the unfiltered version of the text.
                                   if (m[0].length <= 5 && startPos > 0 && text.charAt(startPos-1).match(/[^A-Za-z0-9]/)) {
                                       leftTst = true;  }
                                   if (startPos == 0) {leftTst = true; }
                                   if (m[0].length > 5) {leftTst = true;}
                                   if (m[0].length <= 5 && text.length >= endMatch+1 && text.charAt(endMatch).match(/[^A-Za-z0-9]/)) {
                                         rightTst = true; }
                                   if (text.length < endMatch+1) {rightTst = true; }
                                   if (m[0].length > 5) {rightTst = true; }
                                   if (this.reg.match(/[^A-Z]/) && m[0].match(/[A-Z]/) && m[0].match(/[A-Z]/).length > 1) {capTst = false;}
                                   if (this.reg.match(/[^A-Z]/) && m[0].match(/[A-Z]/) && m[0].match(/^[a-z0-9]/)) {capTst = false; }
// Now check the characters between the first and last matched character to see if there is evidence
// of sentence breaks and other characters that should not appear in the middle of real words:
                                   if (text.slice(startPos,endMatch).match(/\. +[A-Z]/) && (!(m[0].match(/\. +[A-Z]/)))) {middleTst = false; }
                                   if (text.slice(startPos, endMatch).match(/\;/) && (!(m[0].match(/\; +[A-Z]/)))) {middleTst = false; }
                                   if (text.slice(startPos, endMatch).match(/\,/) && (!(m[0].match(/\, +[A-Z]/)))) {middleTst = false; }
                                   if (text.slice(startPos, endMatch).match(/\:/) && (!(m[0].match(/\: +[A-Z]/)))) {middleTst = false; }
                                   if (text.slice(startPos, endMatch).match(/\?/) && (!(m[0].match(/\? +[A-Z]/)))) {middleTst = false; }
                                   if (text.slice(startPos, endMatch).match(/\!/) && (!(m[0].match(/\! +[A-Z]/)))) {middleTst = false; }
                                   if (text.slice(startPos, endMatch).match(/\(/) && (!(m[0].match(/\( +[A-Z]/)))) {middleTst = false; }
                                   if (text.slice(startPos, endMatch).match(/\)/) && (!(m[0].match(/\) +[A-Z]/)))) {middleTst = false; }
                                   if (text.slice(startPos, endMatch).match(/\[/) && (!(m[0].match(/\[ +[A-Z]/)))) {middleTst = false; }
                                   if (text.slice(startPos, endMatch).match(/\]/) && (!(m[0].match(/\] +[A-Z]/)))) {middleTst = false; }
                               }
// Note that we don't test for curly brackets, as they may be present as part of latex markup
// If all the tests come back OK, then we've got a legit match:
                               if (!(leftTst*rightTst*middleTst*capTst)) {return ""; }
                               this.endMatch = ""+endMatch;
                               return this.tIndx;  }});
            }
        }
    }
    return;
  }
// =============== end COMMONLINES ===================
// =============== CHEMISTRY ==========================
// file follows the following format:
//  COlUMN 1: basic name of molecule (eg, "H2O"), COLUMN 2: chemical name, multiple words joined with underscore,
//  COLUMN 3: words to go on the right side of X4 with the words in COLUMN 2 to go on the left side, and then
//            placed into .xSupp
  function chemistry() {
     var clipHere = 0;
     var columns = [];
     var me = '';
     var em = '';
     var sym = '';
     var s = 0;
     var r = '';
     var tmp = '';
     var isoMass = '';
     var isoDesc = '';
     var iMass = '';
     var lines = [];
     var massSymIon = '';
     var symMass = '';
     var matched = '';
     var symbol = '';
     var a = ['angstroms','angstrom','ang','a',
              'centimeters','centimeter','cm',
              'millimeters','millimeter','millimetres','millimetre','mm',
              'micrometers','micrometer','micrometres','micrometre','microns','micron','um',
              'nanometers','nanometer','nanometres','nanometre','nm'];
     var b = ['gigahertz','ghz','megahertz','mhz','terahertz','thz'];
     var c = ['eV', 'keV'];
     var units = (a.concat(b).concat(c)).join('\|');
     var uType = a.join('\|').replace(/[^\|]+/g,'w') + '\|' +
                 b.join('\|').replace(/[^\|]+/g,'f') + '\|' +
                 c.join('\|').replace(/[^\|]+/g,'e');
     var num = /\d{1,5}(?:\.\d+)?/.source;
     var and = /(?:[\,\+\/and\&]{1,4})/.source;
     var three = /((?:lambdalambdalambda)|(?:lambdalambda)|(?:lambda)|(?:lll)|(?:ll)|(?:l)|(?:nununu)|(?:nunu)|(?:nu)|(?:nnn)|(?:nn)|(?:n))?/.source +
                 '('+num+')' + '('+units+')?' + and + '('+num+')' + '('+units+')?' + and + '('+num+')' + '('+units+')?';
     var two = /((?:lambdalambda)|(?:lambda)|(?:ll)|(?:l)|(?:nunu)|(?:nu)|(?:nn)|(?:n))?/.source +
               '('+num+')' + '('+units+')?' + and + '('+num+')' + '('+units+')?';
     var one = /((?:lambda)|(?:l)|(?:nu)|(?:n))?/.source + '('+num+')?' + '('+units+')?';
     var startHere = xLtr.length;

// ============================== read in the MOLECULES file =================================
     lines  = (GM_getResourceText("molecules").trim()).split('\n');
     clipHere = lines.reduce(function(x1,x2,x3) {if (x2.match(/\={20,}/)) {x1.push(x3);} return x1;}, []);
     if (clipHere.length >= 2) {
         lines  = lines.slice(clipHere[0]+1,clipHere[1]);
     } else if (clipHere.length == 1) {
         lines  = lines.slice(clipHere[0]+1); }
     for (s = 0; s < lines.length; s++) {
          lines[s] = lines[s].trim().replace(/  +/g,' ');
          columns = lines[s].split(' ');
          sym = columns[0]+ /((?:\d[\+\-])|(?:\+){1,3}|(?:\-){1,3})?(\[\d\-\d\])?/.source;
 // -------------  3 values listed:
          r = '(?:' + three + sym +')|(?:' + sym + three +')';
          xLtr.push({"reg":r, "priority":"1", "tIndx":columns[1], "nChars":"50", "molecule":columns[0],
                     "nVals":"3", "waveFreqPos":"1|12", "valPos":"2|13", "val1Pos":"2|13",
                     "unitPos":"3|5|7|14|16|18", "chargePos":"8|10", "transPos":"9|11"});
          xLtr.push({"reg":r, "priority":"1", "tIndx":columns[1], "nChars":"50", "molecule":columns[0],
                     "nVals":"3", "waveFreqPos":"1|12", "valPos":"4|15", "val1Pos":"2|13",
                     "unitPos":"3|5|7|14|16|18", "chargePos":"8|10", "transPos":"9|11"});
          xLtr.push({"reg":r, "priority":"1", "tIndx":columns[1], "nChars":"50", "molecule":columns[0],
                     "nVals":"3", "waveFreqPos":"1|12", "valPos":"6|17", "val1Pos":"2|13",
                     "unitPos":"3|5|7|14|16|18", "chargePos":"8|10", "transPos":"9|11"});
// -------------  2 values listed:
          r = '(?:' + two + sym + ')|(?:' + sym + two + ')';
          xLtr.push({"reg":r, "priority":"1", "tIndx":columns[1], "nChars":"40", "molecule":columns[0],
                     "nVals":"2", "waveFreqPos":"1|10", "valPos":"2|11", "val1Pos":"2|11",
                     "unitPos":"3|5|12|14", "chargePos":"6|8", "transPos":"7|9"});
          xLtr.push({"reg":r, "priority":"1", "tIndx":columns[1], "nChars":"40", "molecule":columns[0],
                     "nVals":"2", "waveFreqPos":"1|10", "valPos":"4|13", "val1Pos":"2|11",
                     "unitPos":"3|5|12|14", "chargePos":"6|8", "transPos":"7|9"});
// -------------  1 or no values listed:
          r = '(?:' + one + sym +')|(?:' + sym + one + ')';
          xLtr.push({"reg":r, "priority":"1", "tIndx":columns[1], "nChars":"25", "molecule":columns[0],
                     "nVals":"1", "waveFreqPos":"1|8", "valPos":"2|9", "val1Pos":"2|9",
                     "unitPos":"3|10", "chargePos":"4|6", "transPos":"5|7"});
     }

// ============================== read in the ELEMENTS file =================================
// (https://www.khanacademy.org/science/chemistry/atomic-structure-and-properties/
//         names-and-formulas-of-ionic-compounds/a/naming-monatomic-ions-and-ionic-compounds
// http://www.edu.xunta.es/ftpserver/portal/S_EUROPEAS/FQ/3rdESO_archivos/Nomenclature.htm
// http://preparatorychemistry.com/Bishop_Isotope_Notation.htm
     clipHere = 0;
     lines  = (GM_getResourceText("elements").trim()).split('\n');
// clip out data table from any comments blocks
     clipHere = lines.reduce(function(x1,x2,x3) {if (x2.match(/\={20,}/)) {x1.push(x3);} return x1;}, []);
     if (clipHere.length >= 2) {
         lines  = lines.slice(clipHere[0]+1,clipHere[1]);
     } else if (clipHere.length == 1) {
         lines  = lines.slice(clipHere[0]+1); }
// format of the "elements.txt" file:  Column 1: element symbol (like "He"), Column 2: written out name of the element
// (like "helium"), Column 3: element's atomic number (# protons), Column 4: atomic mass of most abundant stable istope,
// Column 5:  list of other stable isotopes (atomic masses) delimited by vertical bars, Column 6: list of radioisotopes
// (atomic mass) delimited by vertical bars


// come back to
// among the molecules is "NaI", sodium iodide.  Could be confused with "NaI", neutral sodium! Need to have  a
// special catch that tries to distinguish which it is (if surrounded by brackets, is the neutral sodium.  If
// has a charge, is a molecule.

     for (s = 0; s < lines.length; s++) {
          lines[s] = lines[s].trim().replace(/  +/g,' ');
// replace any lone vertical bars with ""
          columns = (lines[s].split(' ')).map(z => z.replace(/^\|$/,''));
          isoMass = columns[3];
          isoDesc = columns[3].replace(/\d+/g,'stable_isotope|most_abundant_isotope');
          isoMass = isoMass + ' ' + columns[4].replace(/\|/g,' ');
          isoDesc = isoDesc + ' ' + columns[4].replace(/\|/g,' ').replace(/\d+/g,'stable_isotope');
          isoMass = isoMass + ' ' + columns[5].replace(/\|/g,' ');
          isoDesc = isoDesc + ' ' + columns[5].replace(/\|/g,' ').replace(/\d+/g,'radio_isotope');
          isoMass = isoMass.replace(/  +/g,' ').trim();
          isoDesc = isoDesc.replace(/  +/g,' ').trim();
          iMass = isoMass.replace(/ /g,'\|');
          massSymIon = '(?:(?:'+columns[2]+'('+iMass+'))|(?:'+'('+iMass+')'+columns[2]+')|('+iMass+'))?' + columns[0] + /([IVX]{0,6})/.source;
          symMass = columns[0] + '(?:(?:'+columns[2]+'('+iMass+'))|(?:'+'('+iMass+')'+columns[2]+')|('+iMass+'))';
          sym = /(\[)?/.source + '(?:(?:'+ symMass + ')|(?:' + massSymIon + '))' + /(\])?/.source;
 // -------------  3 values listed:
          var r = '(?:' + sym + three + ')|(?:' + three + sym + ')';
          xLtr.push({"reg":r, "priority":"1", "tIndx":columns[1], "nChars":"50", "element":columns[0],
                     "isoMass":isoMass, "isoDesc":isoDesc, "nprotons":columns[2], "nVals":"3",
                     "waveFreqPos":"10|17", "valPos":"11|18", "val1Pos":"11|18",
                     "unitPos":"12|14|16|19|21|23", "massPos":"2|3|4|5|6|7|25|26|27|28|29|30",
                     "ionPos":"8|31", "leftPos":"1|24", "rightPos":"9|32"});
          xLtr.push({"reg":r, "priority":"1", "tIndx":columns[1], "nChars":"50", "element":columns[0],
                     "isoMass":isoMass, "isoDesc":isoDesc, "nprotons":columns[2], "nVals":"3",
                     "waveFreqPos":"10|17", "valPos":"13|20", "val1Pos":"11|18",
                     "unitPos":"12|14|16|19|21|23", "massPos":"2|3|4|5|6|7|25|26|27|28|29|30",
                     "ionPos":"8|31", "leftPos":"1|24", "rightPos":"9|32"});
          xLtr.push({"reg":r, "priority":"1", "tIndx":columns[1], "nChars":"50", "element":columns[0],
                     "isoMass":isoMass, "isoDesc":isoDesc, "nprotons":columns[2], "nVals":"3",
                     "waveFreqPos":"10|17", "valPos":"15|22", "val1Pos":"11|18",
                     "unitPos":"12|14|16|19|21|23", "massPos":"2|3|4|5|6|7|25|26|27|28|29|30",
                     "ionPos":"8|31", "leftPos":"1|24", "rightPos":"9|32"});
// -------------  2 values listed:
          var r = '(?:' + sym + two +')|(?:' + two + sym + ')';
          xLtr.push({"reg":r, "priority":"1", "tIndx":columns[1], "nChars":"40", "element":columns[0],
                     "isoMass":isoMass, "isoDesc":isoDesc, "nprotons":columns[2], "nVals":"2",
                     "waveFreqPos":"1|10", "valPos":"11|16", "val1Pos":"11|16",
                     "unitPos":"12|14|17|19", "massPos":"2|3|4|5|6|7|21|22|23|24|25|26",
                     "ionPos":"8|27", "leftPos":"1|20", "rightPos":"9|28"});
          xLtr.push({"reg":r, "priority":"1", "tIndx":columns[1], "nChars":"40", "element":columns[0],
                     "isoMass":isoMass, "isoDesc":isoDesc, "nprotons":columns[2], "nVals":"2",
                     "waveFreqPos":"1|10", "valPos":"13|18", "val1Pos":"11|16",
                     "unitPos":"12|14|17|19", "massPos":"2|3|4|5|6|7|21|22|23|24|25|26",
                     "ionPos":"8|27", "leftPos":"1|20", "rightPos":"9|28"});
// -------------  1 or no values listed:
          var r = '(?:' + sym + one +')|(?:' + one + sym + ')';
          xLtr.push({"reg":r, "priority":"1", "tIndx":columns[1], "nChars":"25", "element":columns[0],
                     "isoMass":isoMass, "isoDesc":isoDesc, "nprotons":columns[2], "nVals":"1",
                     "waveFreqPos":"10|13", "valPos":"11|14", "val1Pos":"11|14",
                     "unitPos":"12|15", "massPos":"2|3|4|5|6|7|17|18|19|20|21|22",
                     "ionPos":"8|23", "leftPos":"1|16", "rightPos":"9|24"});
     }
  // Now add their "indx" fields:
     for (s = startHere; s < xLtr.length; s++) {
         xLtr[s].indx = function(text, startPos, commonLines) {
             if (commonLines === undefined || typeof(commonLines) != "boolean") {commonLines = true; }
             this.endMatch = "-1";
             this.energy = '';
             this.accuracy = '';
             this.x = '';
             this.xSupp = '';
             this.noUnits = '';
             this.symbol = '';
             this.type = '';
             this.charge = '';
             this.transition = '';
             var tmp = '';
             var rightTst = false;
             var leftTst = false;
             var middleTst = true;
             var capTst = true;
             var elementMolecule = '';
             var digitVals = {I:1, V:5, X:10};
             var endMatch = -1;
             var noUnits = '';

             var t = JSON.parse(filterTheText(this.reg, text.slice(startPos)));
             if (this.element !== undefined && this.element !== '') {
                 elementMolecule = this.element;
             } else {
                 elementMolecule = this.molecule; }
// perform a case-insensitive match initially.  If a match exists, and if there are
// capitalized letters involved in both the chemical symbol as well as in the matched text, then
// perform a case-sensitive match and make sure that the match continues:
             m = t[0].match(new RegExp('^'+'(?:'+this.reg+')', 'i'));
             if (m && m[0].match(/[A-Z]/) && this.reg.match(/[A-Z]/)) {
                 m = t[0].match(new RegExp('^'+'(?:'+this.reg+')')); }
             if (m) {
                 endMatch = t[1][m[0].length-1] + 1 + startPos;
// make sure that this is not a false-positive:  if the word is less than 5 characters long,
// insure that there is a non-alphanumeric character on the right and left side of it in
// the unfiltered version of the text.
                 if (m[0].length <= 5 && startPos > 0 && text.charAt(startPos-1).match(/[^A-Za-z0-9]/)) {
                     leftTst = true;  }
                 if (startPos == 0) {leftTst = true; }
                 if (m[0].length > 5) {leftTst = true;}
                 if (m[0].length <= 5 && text.length >= endMatch+1 && text.charAt(endMatch).match(/[^A-Za-z0-9]/)) {
                     rightTst = true; }
                 if (text.length < endMatch+1) {rightTst = true; }
                 if (m[0].length > 5) {rightTst = true; }
// If the match consists of a single capitalized letter (like I for iodine), make sure that the match does
// not occur as the first word of a sentence:
                 if (m[0].match(/[A-Z]/) && m[0].length == 1 && startPos > 0 && text.slice(startPos-5, startPos).match(/[\.\,\;\:] +$/))
                     {capTst = false; }
                 if (text.slice(startPos, endMatch).match(/\;/) && (!(m[0].match(/\; +[A-Z]/)))) {middleTst = false; }
                 if (text.slice(startPos, endMatch).match(/\:/) && (!(m[0].match(/\: +[A-Z]/)))) {middleTst = false; }
                 if (text.slice(startPos, endMatch).match(/\?/) && (!(m[0].match(/\? +[A-Z]/)))) {middleTst = false; }
                 if (text.slice(startPos, endMatch).match(/\!/) && (!(m[0].match(/\! +[A-Z]/)))) {middleTst = false; }
                 if (this.element !== undefined && text.slice(startPos, endMatch).match(/\-/)) {middleTst = false; }
// If all the tests come back OK, then we've got a legit match:
             }
             if (!(leftTst*rightTst*middleTst*capTst)) {return ""; }
// everything below here assumes that there was an acceptable match
             this.endMatch = ""+endMatch
             var indx = this.tIndx;
             var xSupp = '';
             var x = '';
             var ion = '';
             var mass = '';
             var leftBra = '';
             var rightBra = '';
             var transition = '';
             var charge = '';
// extract the "lambdalambda" or "nununu" words, if present in the matched text:
             var lamnu = (this.waveFreqPos.split('\|')).map(z => m[parseInt(z)]).filter(z => z !== undefined && z != '')[0];
             if (lamnu === undefined) {lamnu = ''; }
// extract the first value:
             var val1 = (this.val1Pos.split('\|')).map(z => m[parseInt(z)]).filter(z => z !== undefined && z != '')[0];
             if (val1 === undefined) {val1 = ''; }
// extract the value to be processed (which is the same as Val1 if there was only a single value in the matched text):
             var val = (this.valPos.split('\|')).map(z => m[parseInt(z)]).filter(z => z !== undefined && z != '')[0];
             if (val === undefined) {val = ''; }
// extract the matched units, if present:
             var units = (this.unitPos.split('\|')).map(z => m[parseInt(z)]).filter(z => z !== undefined && z != '')[0];
             if (units === undefined) {units = ''; }
// standardize the unit notation:
             units = units.replace(/^a[a-z]+/i,'ang');
             units = units.replace(/^um$/i,'um').replace(/^mu$/i,'um').replace(/^mic[a-z]+/i,'um');
             units = units.replace(/^cm/i,'cm');
             units = units.replace(/^mil[a-z]+/i,'mm').replace(/^mm/i,'mm');
             units = units.replace(/^n[a-z]+/i,'nm');
             units = units.replace(/^gh[a-z]+/i,'ghz').replace(/^gigah[a-z]+/i,'ghz');
             units = units.replace(/^kh[a-z]+/i,'khz').replace(/^kiloh[a-z]+/i,'khz');
             units = units.replace(/^th[a-z]+/i,'thz').replace(/^terah[a-z]+/i,'thz');
             units = units.replace(/^mh[a-z]+/i,'mhz').replace(/^megah[a-z]+/i,'mhz');
             units = units.replace(/^ev/i,'ev');
             units = units.replace(/^kev/i/'kev').replace(/^kiloe[a-z]+/i,'kev');
             if (this.element !== undefined && this.element != '') {
// extract the ionization level, if present:
                 var ion = (this.ionPos.split('\|')).map(z => m[parseInt(z)]).filter(z => z !== undefined && z != '')[0];
                 if (ion === undefined) {ion = ''; }
// force symbol to carry an ion level designation.  For example, if it is listed only as "Ar", assume
// that "ArI" is implied and explicitly put in the "I".  We insert the missing/implied "I" to insure
// a consistent way to enter this line into the index ... would not want the same exact spectral line to
// be listed under both "Ar" and "ArI".
                 if (ion == '' && val != '') {ion = 'I'; }
                 if (ion != '') {
                     ion = ion.toUpperCase();
// if an ion level is provided, insure that it is a feasible value (e.g., not in excess of the number of
// electrons present in a neutral version of this atom).  Accomplish this task by converting the roman numeral
// into an arabic number and then compare to the value stored under nproton:
                     tmp = 0;
                     ion = ion.split('');
                     for (i = 0; i < ion.length; i++) {
                          if (digitVals[ion[i]] < digitVals[ion[i+1]]) {
                              tmp += digitVals[ion[i+1]] - digitVals[ion[i]];
                              i++;
                          } else {tmp += digitVals[ion[i]]; }
                     }
                     ion = ion.join('');
                     tmp = tmp - 1; // because ion level of I = neutral, II = missing 1 electron, etc.
// see https://initjs.org/translate-roman-numerals-in-javascript-482ef6e55ee7
                     if (tmp > parseInt(this.nprotons)) {
// we have a physically impossible situation (more electrons missing than were there initially), so obviously
// the match to the text has been a false positive, and there really isn't a match.  Put everything back
// the way it was before we thought we had a match, and bail out:
                         this.endMatch = "-1";
                         this.energy = '';
                         this.accuracy = '';
                         this.x = '';
                         this.xSupp = '';
                         this.noUnits = '';
                         this.symbol = '';
                         this.type = '';
                         this.charge = '';
                         this.transition = '';
                         return '';   }
// determine what adjective should be used to describe this ionization level: single for 1 missing electron,
// double for 2 missing electrons, triple for 3 missing electrons, and then multiple if the number of
// missing electrons is less than 10% of the total number of protons, and then high if number of missing
// electrons is in excess of 10% of total number of protons and/or if 10 more more electrons are missing,
// and complete/fully if all electrons are removed:
                     ionDesc = '';
                     if (tmp == 0) {
                         ionDesc = 'neutral';
                     } else if (tmp == 1) {
                         ionDesc = 'singly_ionized';
                     } else if (tmp == 2) {
                         ionDesc = 'doubly_ionized';
                     } else if (tmp == 3) {
                         ionDesc = 'triply_ionized';
                     } else if (tmp < 10 && tmp < 0.1*parseFloat(this.nprotons)) {
                         ionDesc = 'multiply_ionized';
                     } else if ( ((tmp >= 10) || (tmp >= 0.1*parseFloat(this.nprotons))) && tmp < parseInt(this.nprotons) ) {
                         ionDesc = 'highly_ionized';
                     } else if (tmp == parseInt(this.nprotons)) {
                         ionDesc = 'completely_ionized|fully_ionized'; }
                     xSupp = ([... new Set((xSupp + ' ' + this.tIndx+'\_'+ion + 'X4' + ionDesc).trim().split(' '))]).join(' ').trim();   }
// extract the isotopic mass, if available:
                 var mass = (this.massPos.split('\|')).map(z => m[parseInt(z)]).filter(z => z !== undefined && z != '')[0];
                 if (mass === undefined) {mass = ''; }
// extract the left bracket (if present):
                 var leftBra = (this.leftPos.split('\|')).map(z => m[parseInt(z)]).filter(z => z !== undefined && z != '')[0];
                 if (leftBra === undefined) {leftBra = ''; }
// extract the right bracket (if present):
                 var rightBra = (this.rightPos.split('\|')).map(z => m[parseInt(z)]).filter(z => z !== undefined && z != '')[0];
                 if (rightBra === undefined) {rightBra = ''; }
                 if (leftBra != '' && rightBra != '') { // fully forbidden
                     indx = indx + '\|' + 'forbidden';
                 } else if ( (leftBra != '')||(rightBra != '') ) { // semi forbidden
                     leftBra = '';
                     rightBra = '\]';
                     indx = indx + '\|' + '*semi_forbidden';  }
                 if (mass != '') {
// see which description should go with this isotopic mass:
                     z = this.isoMass.split(' ').indexOf(mass);
                     indx = indx + '\|' + mass;
                     xSupp = ([... new Set((xSupp + ' ' + this.tIndx+'\_'+mass + 'X4' + this.isoDesc.split(' ')[z]).trim().split(' '))]).join(' ').trim();   }
                 xSupp = ([... new Set((xSupp + ' ' + this.tIndx + 'X4' + 'element').trim().split(' '))]).join(' ').trim();
                 symbol = leftBra + this.element + ion + rightBra;
             } else if (this.molecule !== undefined && this.molecule != '') {
// extract the charge (if present):
                 charge = (this.chargePos.split('\|')).map(z => m[parseInt(z)]).filter(z => z !== undefined && z != '')[0];
                 if (charge === undefined) {charge = ''; }
// extract the transition (if present):
                 transition = (this.transPos.split('\|')).map(z => m[parseInt(z)]).filter(z => z !== undefined && z != '')[0];
                 if (transition === undefined) {transition = ''; }
                 if (charge != '') {
                     indx = indx + '\|' + charge;
                     if (charge.match(/\-$/)) {
                         xSupp = ([... new Set((xSupp + ' ' + charge + 'X4' + 'anion').trim().split(' '))]).join(' ').trim();
                     } else if (charge.match(/\+$/)) {
                         xSupp = ([... new Set((xSupp + ' ' + charge + 'X4' + 'cation').trim().split(' '))]).join(' ').trim(); }
                 }
                 if (transition != '') {indx = indx + '\|' + transition; }
                 xSupp = ([... new Set((xSupp + ' ' + this.tIndx + 'X4' + 'molecule').trim().split(' '))]).join(' ').trim();
                 symbol = this.molecule + charge + transition;
             }
// Now organize the information:
             if (lamnu.match(/^l/i)) {
                 lamnu = 'w';
             } else if (lamnu.match(/^n/i)) {
                 lamnu = 'f';
             } else {lamnu = ''; }
// If units have been provided, then compute the energy of the line  in units of ev, and let that value
// enter as part of the words to be indexed.
// If val is 2-digits, and val1 is 4 digits, then probably a shorthand notation has been used such
// that the first 2 digits of the wavelength (in angstrom) have been removed for the values following the first one.
// Check for this situation and attach the missing digits if necessary:
             if (val1.indexOf('\.') == -1 && val1.length == 4 && val.length == 2) {
                  units = 'ang';
                  val = val1.slice(0,2) + val; }
// if both a value and units have been supplied, we can compute an energy:
             var info = '';
             var energy = '';
             var delta = '';
             var region = '';
             if (val != '' && units != '') {
                 info = JSON.parse(extractLineEnergy(val, units));
                 energy = info[0];
                 delta = info[1];
                 lamnu = info[3];
                 xSupp = ([... new Set((xSupp + ' ' + energy + 'X4' + 'spectral_line' + '\|' + info[2]).trim().split(' '))]).join(' ').trim();;
                 indx = indx + '\|' + info[0];
             }
             matched = '';
// if a value has been supplied, then see if there is a match-up to any of the lines in the common
// line list (type = lineList):
// Look for matches between the value provided and those in the common-line list that has already been loaded
// into the xLtr and designated by type = "lineList". There are 2 ways to kick off the search: if units have
// been provided and are equal to ev, then do a search on energy.  If no units, then search on the
// wavelength/freqency raw value:
             if (commonLines && val != '') {
                 if (info != '') {
                     matched = xLtr.reduce(function(z1,z2,z3) {
                        var diff;
                        var totDelta;
                        if (z2.type == 'lineList') {
                            totDelta = Math.pow(Math.pow(parseFloat(z2.energyDelta),2) + Math.pow(parseFloat(delta),2),0.5);
                            diff = Math.abs(parseFloat(z2.energy) - parseFloat(energy));
                            if (diff <= totDelta) {z1.push(z3); } }
                        return z1;}, []);
                 } else {
                     matched = xLtr.reduce(function(z1,z2,z3) {
                        var diff;
                        var totDelta;
                        if (z2.type == 'lineList') {
                            totDelta = Math.pow(Math.pow(parseFloat(z2.wfeDelta),2) + Math.pow(parseFloat(z2.wfeDelta),2),0.5);
                            diff = Math.abs(parseFloat(z2.wfeValue) - parseFloat(val));
                            if (diff <= totDelta) {z1.push(z3); } }
                        return z1;}, []);  }
// If the symbol is specified, then lets see if we can further whittle down the list:
                 if (matched.length > 0 && symbol != '') {
                    tmp = matched;
                    matched = xLtr.reduce(function(z1,z2,z3) {
                        if (z2.type == 'lineList' && tmp.indexOf(z3) != -1 && z2.symbol == symbol) {z1.push(z3); }
                        return z1;}, []);  }
// if the unit is specified, then whittle down even further:
                 if (matched.length > 0  && info == '' && units != '' && units != 'ev') {
                    tmp = matched;
                    matched = xLtr.reduce(function(z1,z2,z3) {
                        if (z2.type == 'lineList' && tmp.indexOf(z3) != -1 && z2.units == units) {z1.push(z3); }
                        return z1; }, []);  }
// if the waveFreq is known and the units were not provided, then whittle down further:
                 if (matched.length > 0  && info == '' && units == '' && lamnu != '') {
                    tmp = matched;
                    matched = xLtr.reduce(function(z1,z2,z3) {
                        if (z2.type == 'lineList' && tmp.indexOf(z3) != -1 && z2.waveFreq == lamnu) {z1.push(z3); }
                        return z1; }, []);  }
// if there were multiple matches, get the one that is closest to the provided value:
                 tmp = matched;
                 if (matched.length > 0 && info != '') {
                     matched = xLtr.reduce(function(z1,z2,z3) {
                         var diff;
                         if (z2.type == 'lineList' && tmp.indexOf(z3) != -1) {
                             diff = Math.abs(parseFloat(z2.energy) - parseFloat(energy));
                             if (z1.length > 0 && diff < z1[0]) {z1 = [diff, z3];} else {z1 = [diff, z3]; } }
                     return z1;}, []);
                 } else if (matched.length > 0) {
                     matched = xLtr.reduce(function(z1,z2,z3) {
                         var diff;
                         if (z2.type == 'lineList' && tmp.indexOf(z3) != -1) {
                             diff = Math.abs(parseFloat(z2.wfeValue) - parseFloat(val));
                             if (z1.length > 0 && diff < z1[0]) {z1 = [diff, z3];} else {z1 = [diff, z3]; } }
                     return z1;}, []); }
                 if (matched.length > 0) {
                     matched = matched[1];
                     this.x = xLtr[matched].x;
                     this.xSupp = xLtr[matched].xSupp;
                     this.type = "spectralLine";
                     this.energy = xLtr[matched].energy;
                     this.accuracy = xLtr[matched].energyDelta;
                     this.noUnits = "";
                     this.symbol = xLtr[matched].symbol;
                     return xLtr[matched].indx; }
             }
             indx = ([... new Set(indx.split('\|'))]).join('\|');
             xSupp = ([... new Set(xSupp.trim().split(' '))]).join(' ').trim();
             x = x.replace(/^\|/,'').replace(/\|$/,'');
             if (x != '') {x = ([... new Set(x.split('\|'))]).join('\|'); }
             if (symbol == '') {symbol = 'TBD'; }
             tmp = '';
             if (energy != '') {
                 tmp = energy + '\_' + 'e';
             } else if (val != '') {
                 tmp = val + '\_' + lamnu; }
             if (tmp != '') {
                 tmp = tmp.replace(/\_$/,'');
                 noUnits = (symbol + '\_' + tmp);  }
             if (symbol != 'TBD' && energy != '') {noUnits = ''; }
// If this matched text indicates a spectral line (a value was present), proceed with the xLtr entry:
             if (val != '') {
                this.x = x;
                this.xSupp = xSupp;
                this.type = "spectralLine";
                this.energy = energy;
                if (energy == '') {delta = ''; }
                this.accuracy = delta;
                this.noUnits = noUnits;
                this.symbol = symbol;
                if (energy == '') {indx = indx + '\|' + val; }
                return indx;
             }
// If a value was not present, then we don't have a spectral line but rather mention of
// an element or molecule.  Proceed with that xLtr entry:
             this.x = x;
             this.xSupp = xSupp;
             if (this.element !== undefined && this.element != '') {
                 this.type = "element";
             } else {this.type = "molecule"; }
             this.energy = '';
             this.accuracy = '';
             this.noUnits = '';
             this.symbol = symbol;
             return indx;
         }
     }
     return;
  }
// ===================================================================================================
// ====================== photometry ====================================
//  %%%%%%%%%%%%%%%%%%%%%%%%  passed 3/26/2019
  function photometry() {
// searches for mentions of various photometric filters and systems, and puts the
// corresponding information for indexing into the xLtr.  All filters will be
// indexed by transforming their central wavelengths into an energy (ev), to make
// them compatible with other searches such as spectral features at specific
// wavelengths.
// - - - - - - - - -  COMMON BROAD BAND SYSTEMS (UBVRI, JHK, igriz);
    var ubvriNames = ['U','B','V','R','I',];
    var ubvriWaves = ['3656', '4353', '5477', '6349', '8797'];
    var ubvriDescs = ubvriNames.map(z => 'broad_band|johnson|flux_lambda|photometry');
    var ugrizNames = ['u','g','r','i','z'];
    var ugrizWaves = ['3543','4770','6231','7625','9134'];
    var ugrizDescs = ugrizNames.map(z => 'broad_band|flux_nu|lambda_nu|photometry');
    var bothNames = ['u','r','i']; // could be johnson system in lowercase font
    var bothWaves = ['3656','6349','8797'];
    var bothDescs = ugrizNames.map(z => 'broad_band|johnson|flux_lambda|photometry');
    var miscNames = ['bj','Bj','BJ','bJ'];
    var miscWaves = ['4600','4600','4600','4600'];
    var miscDescs = miscNames.map(z => 'plate|photometry');
    var jhkNames = ['j', 'h', 'k', 'ks', 'J', 'H', 'K', 'Ks', 'KS'];
    var jhkWaves = ['1.22','1.63','2.19','2.15','1.22','1.63','2.19','2.15'];
    var jhkDescs = jhkNames.map(z => 'broad_band|flux_lambda|photometry');
    var fltrs = ubvriNames.concat(ugrizNames).concat(bothNames).concat(jhkNames).concat(miscNames);
    var vals = ubvriWaves.concat(ugrizWaves).concat(bothWaves).concat(jhkWaves).concat(miscWaves);
    var units = ubvriNames.map(z => 'ang').concat(ugrizNames.map(z => 'ang')).concat(bothNames.map(z => 'ang'));
    units = units.concat(jhkNames.map(z => 'um')).concat(miscWaves.map(z => 'ang'));
    var descs = ubvriDescs.concat(ugrizDescs).concat(bothDescs).concat(jhkDescs).concat(miscDescs);
// Now turn the above arrays into long strings delimited by " "
    fltrs = fltrs.join('\|');
    vals = vals.join(' ');
    units = units.join(' ');
    descs = descs.join(' ');
    var i = 0;
    var j = 0;
    var k = 0;

// ==================================== fluxes, magnitudes, luminosities
    var r = /([fFmMlL])/.source + '('+fltrs+')' + /([0tT]{0,2})/.source;
// put in usual broad band stuff
    xLtr.push({"reg":r, "priority":"1", "nChars":"9", "type":"photometry",
               "filtArr":fltrs.replace(/\|/g,' '), "filtVal":vals, "filtUnit":units, "filtDesc":descs,
               "indx":function(text, startPos) {
                   this.endMatch = "-1";
                   this.x = '';
                   this.xSupp = '';
                   var info = '';
                   var idx = '';
                   var xSupp = '';
                   var x = '';
                   var iFilt = 0;
                   var endMatch = -1;
                   var rightTst = false;
                   var leftTst = false;
                   var middleTst = true;
                   var tmp = '';
                   var t = JSON.parse(filterTheText(this.reg, text.slice(startPos)));
                   var m = t[0].match(new RegExp('^'+'(?:'+this.reg+')'));
                   if (m) {
                       endMatch = t[1][m[0].length-1] + 1 + startPos;
// make sure that this is not a false-positive:  if the word is less than 5 characters long,
// insure that there is a non-alphanumeric character on the right and left side of it in
// the unfiltered version of the text.
                       if (m[0].length <= 5 && startPos > 0 && text.charAt(startPos-1).match(/[^A-Za-z0-9]/)) {
                               leftTst = true;  }
                       if (startPos == 0) {leftTst = true; }
                       if (m[0].length > 5) {leftTst = true;}
                       if (m[0].length <= 5 && text.length >= endMatch+1 && text.charAt(endMatch).match(/[^A-Za-z0-9]/)) {
                           rightTst = true; }
                       if (text.length < endMatch+1) {rightTst = true; }
                       if (m[0].length > 5) {rightTst = true; }
// Now check the characters between the first and last matched character to see if there is evidence
// of sentence breaks and other characters that should not appear in the middle of real words:
                       if (text.slice(startPos,endMatch).match(/\. +[A-Z]/) && (!(m[0].match(/\. +[A-Z]/)))) {middleTst = false; }
                       if (text.slice(startPos, endMatch).match(/\;/) && (!(m[0].match(/\; +[A-Z]/)))) {middleTst = false; }
                       if (text.slice(startPos, endMatch).match(/\:/) && (!(m[0].match(/\: +[A-Z]/)))) {middleTst = false; }
                       if (text.slice(startPos, endMatch).match(/\?/) && (!(m[0].match(/\? +[A-Z]/)))) {middleTst = false; }
                       if (text.slice(startPos, endMatch).match(/\!/) && (!(m[0].match(/\! +[A-Z]/)))) {middleTst = false; }
                   }
// If all the tests come back OK, then we've got a legit match:
                   if (!(leftTst*rightTst*middleTst)) {return ""; }
// The match conditions have been met if code executes the below ...
// determine what the central wavelength/freq/energy is:
                   this.endMatch = ""+endMatch;
                   iFilt = this.filtArr.split(' ').findIndex(z => z == m[2]);
// Convert the central wavelength/freq/energy into eV energy
                   info = JSON.parse(extractLineEnergy(this.filtVal.split(' ')[iFilt], this.filtUnit.split(' ')[iFilt]));
// for filters, to make sure that they don't end up with exactly same numerical entry as spectral lines, truncate
// them to have only 4 decimal points rather than the spectral line's 5 decimal points:
                   tmp = info[0]
                   tmp = Number(tmp.match(/\d+\.\d+/));  // get the stuff in front of exponential
                   tmp = Number(Math.round(tmp + 'e4') + 'e-4'); // round the value ... shown here is a trick to ensure a ".5" is dealt with accuractly
// attach the properly rounded off and truncated to 4 decimal points value to the exponential stuff:
                   info[0] = tmp + info[0].replace(/\d+\.\d+/,'');
                   idx = info[0];
                   if (m[1].match(/[fF]/)) {
                       idx = idx + '\|' + 'flux';
                       tmp = ([... new Set(this.filtDesc.split(' ')[iFilt].split('\_'))]).sort().join('\_');
                       tmp = ([... new Set((tmp + '|magnitude|photometry' + '|' + info[2]).split('\|'))]).sort().join('\|');
                       xSupp = info[0] + 'X4' + tmp;
                       x = x + '\|' + info[0] + '\_' + 'magnitude';
                   } else if (m[1] == 'm') {
                       idx = idx + '\|' + 'magnitude';
                       tmp = ([... new Set(this.filtDesc.split(' ')[iFilt].split('\_'))]).sort().join('\_');
                       tmp = ([... new Set((tmp + '|flux|photometry' + '|' + info[2]).split('\|'))]).sort().join('\|');
                       xSupp = info[0] + 'X4' + tmp;
                       x = x + '\|' + info[0] + '\_' + 'flux';
                   } else if (m[1] == 'M') {
                       idx = idx + '\|' + 'absolute\|magnitude';
                       tmp = ([... new Set(this.filtDesc.split(' ')[iFilt].split('\_'))]).sort().join('\_');
                       tmp = ([... new Set((tmp + '|luminosity|photometry' + '|' + info[2]).split('\|'))]).sort().join('\|');
                       xSupp = info[0] + 'X4' + tmp;
                       x = x + '\|' + info[0] + '\_' + 'luminosity';
                   } else if (m[1].toLowerCase() == 'l') {
                       idx = idx + '\|' + 'luminosity';
                       tmp = ([... new Set(this.filtDesc.split(' ')[iFilt].split('\_'))]).sort().join('\_');
                       tmp = ([... new Set((tmp + '|absolute\_magnitude|photometry' + '|' + info[2]).split('\|'))]).sort().join('\|');
                       xSupp = info[0] + 'X4' + tmp;
                       x = x + '\|' + info[0] + '\_' + 'absolute_magnitude'; }
                   if (m[3] !== undefined && m[3].match(/0/)) {idx = idx + '\|' + 'extinction_corrected';}
                   if (m[3] !== undefined && m[3].match(/tT/)) {idx = idx + '\|' + 'total'; }
                   idx = ([... new Set(idx.replace(/\|\|+/,'\|').replace(/^\|/,'').replace(/\|$/,'').split('\|'))]).sort().join('\|');
                   xSupp = ([... new Set(xSupp.replace(/  +/,' ').trim().split(' '))]).sort().join(' ');
                   x = ([... new Set(x.replace(/\|\|+/,'\|').replace(/^\|/,'').replace(/\|$/,'').split('\|'))]).sort().join('\|');
                   this.x = x;
                   this.xSupp = xSupp;
                   this.accuracy = info[1];
                   return idx; } });
// ==================================== mention of filters, photometric colors, or filter systems (up to list of 8 filters)
    r = '('+fltrs+')('+fltrs+')?('+fltrs+')?('+fltrs+')?('+fltrs+')?('+fltrs+')?('+fltrs+')?(?:and)?('+fltrs+')?'+
        /((?:wide)|(?:broad)|(?:narrow))?((?:bandpasses)|(?:bandpass)|(?:bands?)|(?:filters?)|(?:systems?))?/.source;
// We need a xLTr entry for each possible filter that could appear in the list, so we need 8 separate
// entries, each having exactly the same information EXCEPT which captured group is used for the index word.
// Should start with the first captured group and end with the last (8th) captured group.  Note that these groups
// will be undefined if a match is found on the above "r" but less than 8 filters are present in the text. For
// example, UBV would populate the first 3 captured groups on filters above but leave the remaining 5 as undefined.
   for (i = 1; i <= 8; i++) {
        xLtr.push({"reg":r, "priority":"1", "nChars":"35", "type":"photometry", "nVals":"8", "valNum":''+i,
                   "filtArr":fltrs.replace(/\|/g,' '), "filtVal":vals, "filtUnit":units, "filtDesc":descs,
                   "indx":function(text, startPos) {
                       this.endMatch = "-1";
                       this.x = '';
                       this.xSupp = '';
                       var leftTst = false;
                       var rightTst = false;
                       var middleTst = true;
                       var info = '';
                       var idx = '';
                       var endMatch = -1;
                       var iFilt = 0;
                       var xSupp = '';
                       var tmp = '';
                       var x = '';
                       var t = JSON.parse(filterTheText(this.reg, text.slice(startPos)));
                       var m = t[0].match(new RegExp('^'+'(?:'+this.reg+')'));
                       if (m && m[this.valNum] !== undefined) {
                           endMatch = t[1][m[0].length-1] + 1 + startPos;
// make sure that this is not a false-positive:  if the word is less than 5 characters long,
// insure that there is a non-alphanumeric character on the right and left side of it in
// the unfiltered version of the text.
                           if (m[0].length <= 5 && startPos > 0 && text.charAt(startPos-1).match(/[^A-Za-z0-9]/)) {
                                   leftTst = true;  }
                           if (startPos == 0) {leftTst = true; }
                           if (m[0].length > 5) {leftTst = true;}
                           if (m[0].length <= 5 && text.length >= endMatch+1 && text.charAt(endMatch).match(/[^A-Za-z0-9]/)) {
                               rightTst = true; }
                           if (text.length < endMatch+1) {rightTst = true; }
                           if (m[0].length > 5) {rightTst = true; }
// Now check the characters between the first and last matched character to see if there is evidence
// of sentence breaks and other characters that should not appear in the middle of real words:
                           if (text.slice(startPos,endMatch).match(/\. +[A-Z]/) && (!(m[0].match(/\. +[A-Z]/)))) {middleTst = false; }
                           if (text.slice(startPos, endMatch).match(/\;/) && (!(m[0].match(/\; +[A-Z]/)))) {middleTst = false; }
                           if (text.slice(startPos, endMatch).match(/\:/) && (!(m[0].match(/\: +[A-Z]/)))) {middleTst = false; }
                           if (text.slice(startPos, endMatch).match(/\?/) && (!(m[0].match(/\? +[A-Z]/)))) {middleTst = false; }
                           if (text.slice(startPos, endMatch).match(/\!/) && (!(m[0].match(/\! +[A-Z]/)))) {middleTst = false; }
                       }
// If all the tests come back OK, then we've got a legit match:
                       if (!(leftTst*rightTst*middleTst)) {return ""; }
// The match conditions have been met if code executes the below ...
// determine what the central wavelength/freq/energy is:
                       this.endMatch = ""+endMatch;
// determine what the central wavelength/freq/energy is
                       iFilt = this.filtArr.split(' ').findIndex(z => z == m[this.valNum]);
// Convert the central wavelength/freq/energy into eV energy
                       info = JSON.parse(extractLineEnergy(this.filtVal.split(' ')[iFilt], this.filtUnit.split(' ')[iFilt]));
// for filters, to make sure that they don't end up with exactly same numerical entry as spectral lines, truncate
// them to have only 7 decimal points rather than the spectral line's 8 decimal points:
                       tmp = info[0]
                       tmp = Number(tmp.match(/\d+\.\d+/));  // get the stuff in front of exponential
                       tmp = Number(Math.round(tmp + 'e7') + 'e-7'); // round the value ... shown here is a trick to ensure a ".5" is dealt with accuractly
// attach the properly rounded off and truncated to 7 decimal points value to the exponential stuff:
                       info[0] = tmp + info[0].replace(/\d+\.\d+/,'');
                       idx = info[0];
                       tmp = ([... new Set((this.filtDesc.split(' ')[iFilt] + '\|' + info[2] + '\|magnitude|photometry|filter').split('\|'))]).sort().join('\|');
                       xSupp = info[0] + 'X4' + tmp;
                       if (m[9] !== undefined && m[9] == 'wide') {
                          idx = idx + '\|' + 'broad_band_filter';
                       } else if (m[9] !== undefined) {
                          idx = idx + '\|' + m[9] + '\_' + 'band_filter';}
                       idx = ([... new Set(idx.replace(/\|\|+/,'\|').replace(/^\|/,'').replace(/\|$/,'').split('\|'))]).sort().join('\|');
                       xSupp = ([... new Set(xSupp.replace(/  +/,' ').trim().split(' '))]).sort().join(' ');
                       x = ([... new Set(x.replace(/\|\|+/,'\|').replace(/^\|/,'').replace(/\|$/,'').split('\|'))]).sort().join('\|');
                       this.x = x;
                       this.xSupp = xSupp;
                       this.accuracy = info[1];
                       return idx; } });
    }
// ====================================== ab magnitudes
    xLtr.push({"reg":/((?:fab)|(?:Mab)|(?:mab))/.source, "priority":"1", "nChars":"3", "type":"jargon",
               "indx":function(text, startPos) {
                   var leftTst = false;
                   var rightTst = false;
                   var middleTst = true;
                   this.endMatch = "-1";
                   this.x = '';
                   this.xSupp = '';
                   var endMatch = -1;
                   var leftTst = false;
                   var rightTst = false;
                   var middleTst = true;
                   var t = JSON.parse(filterTheText(this.reg, text.slice(startPos)));
                   var m = t[0].match(new RegExp('^'+'(?:'+this.reg+')'));
                   if (m) {
                       endMatch = t[1][m[0].length-1] + 1 + startPos;
                       if ( (startPos == 0) || (text.charAt(startPos-1).match(/[^A-Za-z0-9]/)) ) {leftTst = true; }
                       if ( (endMatch == text.length-1) || (text.charAt(endMatch).match(/[^A-Za-z0-9]/)) ) {rightTst = true; }
                       if (text.slice(startPos, endMatch).match(/\. +[A-Z]/) && (!(m[0].match(/\. +[A-Z]/)))) {middleTst = false; }
                       if (text.slice(startPos, endMatch).match(/\;/) && (!(m[0].match(/\; +[A-Z]/)))) {middleTst = false; }
                       if (text.slice(startPos, endMatch).match(/\:/) && (!(m[0].match(/\: +[A-Z]/)))) {middleTst = false; }
                       if (text.slice(startPos, endMatch).match(/\?/) && (!(m[0].match(/\? +[A-Z]/)))) {middleTst = false; }
                       if (text.slice(startPos, endMatch).match(/\!/) && (!(m[0].match(/\! +[A-Z]/)))) {middleTst = false; }
                       if (text.slice(startPos, endMatch).match(/\-/) && (!(m[0].match(/\- +[A-Z]/)))) {middleTst = false; }
                   }
                   if (!(leftTst*rightTst*middleTst)) {return ''; }
                   this.endMatch = ''+endMatch;
                   if (m[1] == 'fab') {
                       this.xSupp = 'flux_lambda_nuX4sloan_digital_sky_survey_filter';
                       return 'flux_lambda_nu';
                   } else if (m[1] == 'Mab') {
                       this.xSupp = 'absolute_magnitude_lambda_nuX4sloan_digital_sky_survey_filter|luminosity';
                       return 'absolute_magnitude_lambda_nu';
                   } else if (m[1] == 'mab') {
                       this.xSupp = 'magnitude_lambda_nuX4sloan_digital_sky_survey_filter';
                       return 'magnitude_lambda_nu';} } });
    xLtr.push({"reg":/ab((?:mag)|(?:magnitudes?)|(?:flux)|(?:fluxes)|(?:systems?)|(?:filters?))/.source,
               "priority":"1", "nChars":"12", "type":"photometry", "type":"jargon",
               "indx":function(text, startPos) {
                    this.endMatch = "-1";
                    this.x = '';
                    this.xSupp = '';
                    var endMatch = -1;
                    var leftTst = false;
                    var rightTst = false;
                    var middleTst = true;
                    var t = JSON.parse(filterTheText(this.reg, text.slice(startPos)));
                    var m = t[0].match(new RegExp('^'+'(?:'+this.reg+')'));
                    if (m) {
                       endMatch = t[1][m[0].length-1] + 1 + startPos;
                       if ( (startPos == 0) || (text.charAt(startPos-1).match(/[^A-Za-z0-9]/)) ) {leftTst = true; }
                       if (m[0].length > 5) {leftTst = true; }
                       if ( (endMatch == text.length-1) || (text.charAt(endMatch).match(/[^A-Za-z0-9]/)) ) {rightTst = true; }
                       if (m[0].length > 5) {rightTst = true; }
                       if (text.slice(startPos,endMatch).match(/\. +[A-Z]/) && (!(m[0].match(/\. +[A-Z]/)))) {middleTst = false; }
                       if (text.slice(startPos, endMatch).match(/\;/) && (!(m[0].match(/\; +[A-Z]/)))) {middleTst = false; }
                       if (text.slice(startPos, endMatch).match(/\:/) && (!(m[0].match(/\: +[A-Z]/)))) {middleTst = false; }
                       if (text.slice(startPos, endMatch).match(/\?/) && (!(m[0].match(/\? +[A-Z]/)))) {middleTst = false; }
                       if (text.slice(startPos, endMatch).match(/\!/) && (!(m[0].match(/\! +[A-Z]/)))) {middleTst = false; }
                       if (text.slice(startPos, endMatch).match(/\-/) && (!(m[0].match(/\- +[A-Z]/)))) {middleTst = false; }
                    }
                    if (!(leftTst*rightTst*middleTst)) {return ''; }
                    this.endMatch = ""+endMatch;
                    if (m[1].charAt(0) == 'f') {
                        this.xSupp = 'flux_lambda_nuX4sloan_digital_sky_survey_filter';
                        return 'flux_lambda_nu';
                    } else if (m[1].charAt(0) == 'm') {
                        this.xSupp = 'magnitude_lambda_nuX4sloan_digital_sky_survey_filter';
                        return 'magnitude_lambda_nu';
                    } else {
                        this.xSupp = 'lambda_nuX4sloan_digital_sky_survey_filter';
                        return 'lambda_nu_system';} }});
    xLtr.push({"reg":/ab/.source, "priority":"1", "nChars":"2", "type":"jargon",
               "indx":function(text, startPos) {
                    this.endMatch = "-1";
                    this.x = '';
                    this.xSupp = '';
                    var endMatch = -1;
                    var leftTst = false;
                    var rightTst = false;
                    var leftTst = false;
                    var rightTst = false;
                    var middleTst = true;
                    var t = JSON.parse(filterTheText(this.reg, text.slice(startPos)));
                    var m = t[0].match(new RegExp('^'+'(?:'+this.reg+')'));
                    if (m) {
                       endMatch = t[1][m[0].length-1] + 1 + startPos;
                       if ( (startPos == 0) || (text.charAt(startPos-1).match(/[^A-Za-z0-9]/)) ) {leftTst = true; }
                       if (m[0].length > 5) {leftTst = true; }
                       if ( (endMatch == text.length-1) || (text.charAt(endMatch).match(/[^A-Za-z0-9]/)) ) {rightTst = true; }
                       if (m[0].length > 5) {rightTst = true; }
                       if (text.slice(startPos,endMatch).match(/\. +[A-Z]/) && (!(m[0].match(/\. +[A-Z]/)))) {middleTst = false; }
                       if (text.slice(startPos, endMatch).match(/\;/) && (!(m[0].match(/\; +[A-Z]/)))) {middleTst = false; }
                       if (text.slice(startPos, endMatch).match(/\:/) && (!(m[0].match(/\: +[A-Z]/)))) {middleTst = false; }
                       if (text.slice(startPos, endMatch).match(/\?/) && (!(m[0].match(/\? +[A-Z]/)))) {middleTst = false; }
                       if (text.slice(startPos, endMatch).match(/\!/) && (!(m[0].match(/\! +[A-Z]/)))) {middleTst = false; }
                       if (text.slice(startPos, endMatch).match(/\-/) && (!(m[0].match(/\- +[A-Z]/)))) {middleTst = false; }
                    }
                    if (!(leftTst*rightTst*middleTst)) {return ''; }
                    this.endMatch = ""+endMatch;
                    this.xSupp = 'lambda_nuX4sloan_digital_sky_survey_filter';
                    return 'lambda_nu_system'; }});
// ====================================== colors
// Will need to add 2 entries, each to capture one of the 2 filters involved in the color:
    for (i = 1; i <= 2; i++) {
        xLtr.push({"reg":'('+fltrs+')' + /\-/.source + '('+fltrs+')', "priority":"1",
                   "nChars":"3", "nVars":"2", "valNum":''+i, "type":"photometry",
                   "filtArr":fltrs.replace(/\|/g,' '), "filtVal":vals, "filtUnit":units, "filtDesc":descs,
                    "indx":function(text, startPos) {
                       this.endMatch = "-1";
                       this.x = '';
                       this.xSupp = '';
                       var info = '';
                       var idx = '';
                       var tmp = '';
                       var endMatch = -1;
                       var info = '';
                       var iFilt = 0;
                       var xSupp = '';
                       var x = '';
                       var leftTst = false;
                       var rightTst = false;
                       var leftTst = false;
                       var rightTst = false;
                       var middleTst = true;
                       var t = JSON.parse(filterTheText(this.reg, text.slice(startPos)));
                       var m = t[0].match(new RegExp('^'+'(?:'+this.reg+')'));
                       if (m) {
                          endMatch = t[1][m[0].length-1] + 1 + startPos;
                          if ( (startPos == 0) || (text.charAt(startPos-1).match(/[^A-Za-z0-9]/)) ) {leftTst = true; }
                          if (m[0].length > 5) {leftTst = true; }
                          if ( (endMatch == text.length-1) || (text.charAt(endMatch).match(/[^A-Za-z0-9]/)) ) {rightTst = true; }
                          if (m[0].length > 5) {rightTst = true; }
                          if (text.slice(startPos, endMatch).match(/\. +[A-Z]/) && (!(m[0].match(/\. +[A-Z]/)))) {middleTst = false; }
                          if (text.slice(startPos, endMatch).match(/\;/) && (!(m[0].match(/\; +[A-Z]/)))) {middleTst = false; }
                          if (text.slice(startPos, endMatch).match(/\:/) && (!(m[0].match(/\: +[A-Z]/)))) {middleTst = false; }
                          if (text.slice(startPos, endMatch).match(/\?/) && (!(m[0].match(/\? +[A-Z]/)))) {middleTst = false; }
                          if (text.slice(startPos, endMatch).match(/\!/) && (!(m[0].match(/\! +[A-Z]/)))) {middleTst = false; }
                          if (text.slice(startPos, endMatch).match(/\-/) && (!(m[0].match(/\- +[A-Z]/)))) {middleTst = false; }
                       }
                       if (!(leftTst*rightTst*middleTst)) {return ''; }
                       this.endMatch = ""+endMatch;
// determine what the central wavelength/freq/energy is
                       iFilt = this.filtArr.split(' ').findIndex(z => z == m[this.valNum]);
// Convert the central wavelength/freq/energy into eV energy
                       info = JSON.parse(extractLineEnergy(this.filtVal.split(' ')[iFilt], this.filtUnit.split(' ')[iFilt]));
// for filters, to make sure that they don't end up with exactly same numerical entry as spectral lines, truncate
// them to have only 4 decimal points rather than the spectral line's 5 decimal points:
                       tmp = info[0]
                       tmp = Number(tmp.match(/\d+\.\d+/));  // get the stuff in front of exponential
                       tmp = Number(Math.round(tmp + 'e4') + 'e-4'); // round the value ... shown here is a trick to ensure a ".5" is dealt with accuractly
// attach the properly rounded off and truncated to 4 decimal points value to the exponential stuff:
                       info[0] = tmp + info[0].replace(/\d+\.\d+/,'');
                       tmp = ([... new Set((this.filtDesc.split(' ')[iFilt].split('\_') + '|' + info[2]).split('\|'))]).sort().join('\|');
                       xSupp = info[0] + 'X4' + tmp;


// COME BACK TO
// would be really cool to determine whether the color was "red" or "blue" and then to insert that word into the xSupp as "blue_color" or "red_color"

                       idx = info[0] + '\|' + 'color';
                       idx = ([... new Set(idx.replace(/\|\|+/,'\|').replace(/^\|/,'').replace(/\|$/,'').split('\|'))]).sort().join('\|');
                       xSupp = ([... new Set(xSupp.replace(/  +/,' ').trim().split(' '))]).sort().join(' ');

                        // COME BACK TO
                        // is "x" defined before the sorting below????


                       x = ([... new Set(x.replace(/\|\|+/,'\|').replace(/^\|/,'').replace(/\|$/,'').split('\|'))]).sort().join('\|');
                       this.x = x;
                       this.xSupp = xSupp;
                       this.accuracy = info[1];
                       return idx; }});
    }
// - - - - - - - - -  HST FILTER SYSTEM
//http://www.stsci.edu/hst/wfc3/ins_performance/ground/components/filters
// ==================================== fluxes, magnitudes, luminosities
    var hst = /[fF](\d{3,4})((?:[wW])|(?:lp)|(?:LP)|(?:[xX])|(?:[mM])|(?:[nN]))/.source
    r = /([fFmMlL])/.source + hst + /([0tT]{0,2})/.source;
    xLtr.push({"reg":r, "priority":"1", "nChars":"9", "type":"photometry",
               "indx":function(text, startPos) {
                   this.endMatch = "-1";
                   this.x = '';
                   this.xSupp = '';
                   var units = '';
                   var val = '';
                   var info = '';
                   var tmp = '';
                   var idx = '';
                   var endMatch = -1;
                   var delta = '';
                   var xSupp = '';
                   var x = '';
                   var leftTst = false;
                   var rightTst = false;
                   var middleTst = true;
                   var t = JSON.parse(filterTheText(this.reg, text.slice(startPos)));
                   var m = t[0].match(new RegExp('^'+'(?:'+this.reg+')'));
                   if (m) {
                       endMatch = t[1][m[0].length-1] + 1 + startPos;
                       if ( (startPos == 0) || (text.charAt(startPos-1).match(/[^A-Za-z0-9]/)) ) {leftTst = true; }
                       if (m[0].length > 5) {leftTst = true; }
                       if ( (endMatch == text.length-1) || (text.charAt(endMatch).match(/[^A-Za-z0-9]/)) ) {rightTst = true; }
                       if (m[0].length > 5) {rightTst = true; }
                       if (text.slice(startPos, endMatch).match(/\. +[A-Z]/) && (!(m[0].match(/\. +[A-Z]/)))) {middleTst = false; }
                       if (text.slice(startPos, endMatch).match(/\;/) && (!(m[0].match(/\; +[A-Z]/)))) {middleTst = false; }
                       if (text.slice(startPos, endMatch).match(/\:/) && (!(m[0].match(/\: +[A-Z]/)))) {middleTst = false; }
                       if (text.slice(startPos, endMatch).match(/\?/) && (!(m[0].match(/\? +[A-Z]/)))) {middleTst = false; }
                       if (text.slice(startPos, endMatch).match(/\!/) && (!(m[0].match(/\! +[A-Z]/)))) {middleTst = false; }
                       if (text.slice(startPos, endMatch).match(/\-/) && (!(m[0].match(/\- +[A-Z]/)))) {middleTst = false; }
                   }
                   if (!(leftTst*rightTst*middleTst)) {return ''; }
                   this.endMatch = ""+endMatch;
// the wavelength is approximately the 2nd captured group of numbers.  If the wavelength
// is less than 200, then the units are in microns. Otherwise, in angstrom:
                   val = m[2];
                   if (parseInt(val) < 200) {
                       units = 'um';
                       val = val.charAt(0) + '\.' + val.slice(1);
                   } else {
                       units = 'ang';
                       val = val + '0'; }
// some of the names do not accuractely reflect their true central wavelengths, so make corrections:
                   if (val == '3360') {
                       val = '3375';
                   } else if (val == '4380') {
                       val = '4320';
                   } else if (val == '5550') {
                       val = '5410';
                   } else if (val == '6060') {
                       val = '5956';
                   } else if (val == '7750') {
                       val = '7760';
                   } else if (val == '8140') {
                       val = '8353';
                   } else if (val == '2000' && m[3].match(/lp/i)) {
                       val = '5000';
                   } else if (val == '3500' && m[3].match(/lp/i)) {
                       val = '5500';
                   } else if (val == '6000' && m[3].match(/lp/i)) {
                       val = '7000';
                   } else if (val == '8500' && m[3].match(/lp/i)) {
                       val = '9000'; }
// Convert the central wavelength/freq/energy into eV energy
                   delta = '20';
                   if (units == 'um') {delta = '0.02'; }
                   info = JSON.parse(extractLineEnergy(val, units, delta));
// for filters, to make sure that they don't end up with exactly same numerical entry as spectral lines, truncate
// them to have only 7 decimal points rather than the spectral line's 8 decimal points:
                   tmp = info[0]
                   tmp = Number(tmp.match(/\d+\.\d+/));  // get the stuff in front of exponential
                   tmp = Number(Math.round(tmp + 'e7') + 'e-7'); // round the value ... shown here is a trick to ensure a ".5" is dealt with accuractly
// attach the properly rounded off and truncated to 7 decimal points value to the exponential stuff:
                   info[0] = tmp + info[0].replace(/\d+\.\d+/,'');
                   idx = info[0];
                   if (m[3].match(/[wW]/)) {
                       idx = idx + '\|' + 'broad_band_filter';
                   } else if (m[3].match(/[nN]/)) {
                       idx = idx + '\|' + 'narrow_band_filter';
                   } else if (m[3].match(/lp/i)) {
                       idx = idx + '\|' + 'long_band_pass_filter';
                   } else if (m[3].match(/x/i)) {
                       idx = idx + '\|' + 'very_broad_band_filter';
                   } else {
                       idx = idx + '\|' + 'filter'; }
                   if (m[1].match(/[fF]/)) {
                       idx = idx + '\|' + 'flux';
                       xSupp = info[0] + 'X4' + 'magnitude|hubble_space_telescope_photometry|photometry';
                       x = x + '\|' + info[0] + '\_' + 'magnitude';
                   } else if (m[1] == 'm') {
                       idx = idx + '\|' + 'magnitude';
                       xSupp = info[0] + 'X4' + 'hubble_space_telescope_photometry|flux|photometry';
                       x = x + '\|' + info[0] + '\_' + 'flux';
                   } else if (m[1] == 'M') {
                       idx = idx + '\|' + 'absolute\|magnitude';
                       xSupp = info[0] + 'X4' + 'hubble_space_telescope_photometry|luminosity|photometry';
                       x = x + '\|' + info[0] + '\_' + 'luminosity';
                   } else if (m[1].toLowerCase() == 'l') {
                       idx = idx + '\|' + 'luminosity';
                       xSupp = info[0] + 'X4' + 'hubble_space_telescope_photometry|absolute\_magnitude|photometry';
                       x = x + '\|' + info[0] + '\_' + 'absolute_magnitude'; }
                   if (!m[3].match(/lp/i) && val != '9000' ) {xSupp = xSupp + ' ' + info[0] + 'X4' + info[2]; }// add spectral region
                   if (m[4] !== undefined && m[4].match(/0/)) {indx = indx + '\|' + 'extinction_corrected';}
                   if (m[4] !== undefined && m[4].match(/tT/)) {indx = indx + '\|' + 'total'; }
                   xSupp = xSupp + ' ' + 'magnitude' + 'X4' + 'photometry'
                   idx = ([... new Set(idx.replace(/^\|/,'').replace(/\|$/,'').split('\|'))]).sort().join('\|');
                   xSupp = ([... new Set(xSupp.replace(/  +/,' ').trim().split(' '))]).sort().join(' ');
                   x = ([... new Set(x.replace(/^\|/,'').replace(/\|$/,'').split('\|'))]).sort().join('\|');
                   this.x = x;
                   this.xSupp = xSupp;
                   this.accuracy = info[1];
                   return idx; } });
// ==================================== mention of filters, photometric colors, or filter systems (up to list of 8 filters)
    r = hst+'('+hst+')?('+hst+')?('+hst+')?('+hst+')?('+hst+')?('+hst+')?(?:and)?('+hst+')?'+
        /((?:bandpasses)|(?:bandpass)|(?:bands?)|(?:filters?)|(?:systems?))?/.source;
    for (i = 1; i <= 8; i++) {
        xLtr.push({"reg":r, "priority":"1", "nChars":"60", "nVals":"8", "valNum":''+((i-1)*2+1), "type":"photometry",
                   "indx":function(text, startPos) {
                       this.endMatch = "-1";
                       this.x = '';
                       this.xSupp = '';
                       var info = '';
                       var tmp = '';
                       var idx = '';
                       var endMatch = -1;
                       var delta = '';
                       var xSupp = '';
                       var x = '';
                       var leftTst = false;
                       var rightTst = false;
                       var middleTst = true;
                       var t = JSON.parse(filterTheText(this.reg, text.slice(startPos)));
                       var m = t[0].match(new RegExp('^'+'(?:'+this.reg+')'));
                       if (m && m[this.valNum] !== undefined) {
                          endMatch = t[1][m[0].length-1] + 1 + startPos;
                          if ( (startPos == 0) || (text.charAt(startPos-1).match(/[^A-Za-z0-9]/)) ) {leftTst = true; }
                          if (m[0].length > 5) {leftTst = true; }
                          if ( (endMatch == text.length-1) || (text.charAt(endMatch).match(/[^A-Za-z0-9]/)) ) {rightTst = true; }
                          if (m[0].length > 5) {rightTst = true; }
                          if (text.slice(startPos, endMatch).match(/\. +[A-Z]/) && (!(m[0].match(/\. +[A-Z]/)))) {middleTst = false; }
                          if (text.slice(startPos, endMatch).match(/\;/) && (!(m[0].match(/\; +[A-Z]/)))) {middleTst = false; }
                          if (text.slice(startPos, endMatch).match(/\:/) && (!(m[0].match(/\: +[A-Z]/)))) {middleTst = false; }
                          if (text.slice(startPos, endMatch).match(/\?/) && (!(m[0].match(/\? +[A-Z]/)))) {middleTst = false; }
                          if (text.slice(startPos, endMatch).match(/\!/) && (!(m[0].match(/\! +[A-Z]/)))) {middleTst = false; }
                          if (text.slice(startPos, endMatch).match(/\-/) && (!(m[0].match(/\- +[A-Z]/)))) {middleTst = false; }
                       }
                       if (!(leftTst*rightTst*middleTst)) {return ''; }
                       this.endMatch = ""+endMatch;
                       val = m[this.valNum];
                       if (parseInt(val) < 200) {
                           units = 'um';
                           val = val.charAt(0) + '\.' + val.slice(1);
                       } else {
                           units = 'ang';
                           val = val + '0'; }
                       if (val == '3360') {
                           val = '3375';
                       } else if (val == '4380') {
                           val = '4320';
                       } else if (val == '5550') {
                           val = '5410';
                       } else if (val == '6060') {
                           val = '5956';
                       } else if (val == '7750') {
                           val = '7760';
                       } else if (val == '8140') {
                           val = '8353';
                       } else if (val == '2000' && m[this.valNum+1].match(/lp/i)) {
                           val = '5000';
                       } else if (val == '3500' && m[this.valNum+1].match(/lp/i)) {
                           val = '5500';
                       } else if (val == '6000' && m[this.valNum+1].match(/lp/i)) {
                           val = '7000';
                       } else if (val == '8500' && m[this.valNum+1].match(/lp/i)) {
                           val = '9000'; }
                       delta = '20';
                       if (units == 'um') {delta = '0.02'; }
                       info = JSON.parse(extractLineEnergy(val, units, delta));
// for filters, to make sure that they don't end up with exactly same numerical entry as spectral lines, truncate
// them to have only 7 decimal points rather than the spectral line's 8 decimal points:
                       tmp = info[0]
                       tmp = Number(tmp.match(/\d+\.\d+/));  // get the stuff in front of exponential
                       tmp = Number(Math.round(tmp + 'e7') + 'e-7'); // round the value ... shown here is a trick to ensure a ".5" is dealt with accuractly
// attach the properly rounded off and truncated to 8 decimal points value to the exponential stuff:
                       info[0] = tmp + info[0].replace(/\d+\.\d+/,'');
                       idx = info[0];
                       if (m[this.valNum+1].match(/[wW]/)) {
                           idx = idx + '\|' + 'broad_band_filter';
                       } else if (m[this.valNum+1].match(/[nN]/)) {
                           idx = idx + '\|' + 'narrow_band_filter';
                       } else if (m[this.valNum+1].match(/lp/i)) {
                           idx = idx + '\|' + 'long_band_pass_filter';
                       } else if (m[this.valNum+1].match(/x/i)) {
                           idx = idx + '\|' + 'very_broad_band_filter';
                       } else {
                           idx = idx + '\|' + 'filter'; }
                       if (!m[this.valNum+1].match(/lp/i) && val != '9000' ) {
                           xSupp = xSupp + ' ' + info[0] + 'X4' + info[2]; }// add spectral region
                       xSupp = info[0] + 'X4' + 'hubble_space_telescope_photometry';
                       idx = ([... new Set(idx.replace(/^\|/,'').replace(/\|$/,'').split('\|'))]).sort().join('\|');
                       xSupp = ([... new Set(xSupp.replace(/  +/,' ').trim().split(' '))]).sort().join(' ');
                       x = ([... new Set(x.replace(/^\|/,'').replace(/\|$/,'').split('\|'))]).sort().join('\|');
                       this.x = x;
                       this.xSupp = xSupp;
                       this.accuracy = info[1];
                       return idx; } });
    }
// ====================================== colors
// Will need to add 2 entries, each to capture one of the 2 filters involved in the color:
    for (i = 1; i <= 2; i++) {
        xLtr.push({"reg": hst + '\-' + hst, "priority":"1", "nChars":"15", "nVars":"2",
                   "valNum":''+((i-1)*2+1),"type":"photometry",
                   "indx":function(text, startPos) {
                       this.endMatch = "-1";
                       this.x = '';
                       this.xSupp = '';
                       var info = '';
                       var tmp = '';
                       var idx = '';
                       var endMatch = -1;
                       var xSupp = '';
                       var x = '';
                       var delta = '';
                       var leftTst = false;
                       var rightTst = false;
                       var middleTst = true;
                       var t = JSON.parse(filterTheText(this.reg, text.slice(startPos)));
                       var m = t[0].match(new RegExp('^'+'(?:'+this.reg+')'));
                       if (m) {
                          endMatch = t[1][m[0].length-1] + 1 + startPos;
                          if ( (startPos == 0) || (text.charAt(startPos-1).match(/[^A-Za-z0-9]/)) ) {leftTst = true; }
                          if (m[0].length > 5) {leftTst = true; }
                          if ( (endMatch == text.length-1) || (text.charAt(endMatch).match(/[^A-Za-z0-9]/)) ) {rightTst = true; }
                          if (m[0].length > 5) {rightTst = true; }
                          if (text.slice(startPos, endMatch).match(/\. +[A-Z]/) && (!(m[0].match(/\. +[A-Z]/)))) {middleTst = false; }
                          if (text.slice(startPos, endMatch).match(/\;/) && (!(m[0].match(/\; +[A-Z]/)))) {middleTst = false; }
                          if (text.slice(startPos, endMatch).match(/\:/) && (!(m[0].match(/\: +[A-Z]/)))) {middleTst = false; }
                          if (text.slice(startPos, endMatch).match(/\?/) && (!(m[0].match(/\? +[A-Z]/)))) {middleTst = false; }
                          if (text.slice(startPos, endMatch).match(/\!/) && (!(m[0].match(/\! +[A-Z]/)))) {middleTst = false; }
                          if (text.slice(startPos, endMatch).match(/\-/) && (!(m[0].match(/\- +[A-Z]/)))) {middleTst = false; }
                       }
                       if (!(leftTst*rightTst*middleTst)) {return ''; }
                       this.endMatch = ""+endMatch;
                       val = m[this.valNum];
                       if (parseInt(val) < 200) {
                           units = 'um';
                           val = val.charAt(0) + '\.' + val.slice(1);
                       } else {
                           units = 'ang';
                           val = val + '0'; }
                       if (val == '3360') {
                           val = '3375';
                       } else if (val == '4380') {
                           val = '4320';
                       } else if (val == '5550') {
                           val = '5410';
                       } else if (val == '6060') {
                           val = '5956';
                       } else if (val == '7750') {
                           val = '7760';
                       } else if (val == '8140') {
                           val = '8353';
                       } else if (val == '2000' && m[this.valNum].match(/lp/i)) {
                           val = '5000';
                       } else if (val == '3500' && m[this.valNum].match(/lp/i)) {
                           val = '5500';
                       } else if (val == '6000' && m[this.valNum].match(/lp/i)) {
                           val = '7000';
                       } else if (val == '8500' && m[this.valNum].match(/lp/i)) {
                           val = '9000'; }
                       delta = '20';
                       if (units == 'um') {delta = '0.02'; }
                       info = JSON.parse(extractLineEnergy(val, units, delta));
// for filters, to make sure that they don't end up with exactly same numerical entry as spectral lines, truncate
// them to have only 7 decimal points rather than the spectral line's 8 decimal points:
                       tmp = info[0]
                       tmp = Number(tmp.match(/\d+\.\d+/));  // get the stuff in front of exponential
                       tmp = Number(Math.round(tmp + 'e7') + 'e-7'); // round the value ... shown here is a trick to ensure a ".5" is dealt with accuractly
// attach the properly rounded off and truncated to 7 decimal points value to the exponential stuff:
                       info[0] = tmp + info[0].replace(/\d+\.\d+/,'');
                       idx = info[0];
                       if (m[this.valNum+1].match(/[wW]/)) {
                           idx = idx + '\|' + 'broad_band_filter';
                       } else if (m[this.valNum+1].match(/[nN]/)) {
                           idx = idx + '\|' + 'narrow_band_filter';
                       } else if (m[this.valNum+1].match(/lp/i)) {
                           idx = idx + '\|' + 'long_band_pass_filter';
                       } else if (m[this.valNum+1].match(/x/i)) {
                           idx = idx + '\|' + 'very_broad_band_filter';
                       } else {
                           idx = idx + '\|' + 'filter'; }
                       if (!m[this.valNum+1].match(/lp/i) && val != '9000' ) {
                           xSupp = xSupp + ' ' + info[0] + 'X4' + info[2]; }// add spectral region
                       xSupp = info[0] + 'X4' + 'hubble_space_telescope_photometry';
                       idx = info[0] + '\|' + 'color';
                       idx = ([... new Set(idx.replace(/^\|/,'').replace(/\|$/,'').split('\|'))]).sort().join('\|');
                       xSupp = ([... new Set(xSupp.replace(/  +/,' ').trim().split(' '))]).sort().join(' ');
                       x = ([... new Set(x.replace(/^\|/,'').replace(/\|$/,'').split('\|'))]).sort().join('\|');
                       this.x = x;
                       this.xSupp = xSupp;
                       this.accuracy = info[1];
                       return idx; } });
    }
// ====================================== grisms/prisms
    var r = /((?:[gG])|(?:pr)|(?:PR)|(?:Pr))(\d{3,4})/.source
    var indx = '';
    xLtr.push({"reg":r, "priority":"1", "nChars":"5", "type":"photometry",
               "indx":function(text, startPos) {
                   this.endMatch = "-1";
                   this.x = '';
                   this.xSupp = '';
                   var units = '';
                   var val = '';
                   var info = '';
                   var tmp = '';
                   var idx = '';
                   var endMatch = -1;
                   var delta = '';
                   var xSupp = '';
                   var x = '';
                   var leftTst = false;
                   var rightTst = false;
                   var middleTst = true;
                   var t = JSON.parse(filterTheText(this.reg, text.slice(startPos)));
                   var m = t[0].match(new RegExp('^'+'(?:'+this.reg+')'));
                   if (m) {
                      endMatch = t[1][m[0].length-1] + 1 + startPos;
                      if ( (startPos == 0) || (text.charAt(startPos-1).match(/[^A-Za-z0-9]/)) ) {leftTst = true; }
                      if (m[0].length > 5) {leftTst = true; }
                      if ( (endMatch == text.length-1) || (text.charAt(endMatch).match(/[^A-Za-z0-9]/)) ) {rightTst = true; }
                      if (m[0].length > 5) {rightTst = true; }
                      if (text.slice(startPos, endMatch).match(/\. +[A-Z]/) && (!(m[0].match(/\. +[A-Z]/)))) {middleTst = false; }
                      if (text.slice(startPos, endMatch).match(/\;/) && (!(m[0].match(/\; +[A-Z]/)))) {middleTst = false; }
                      if (text.slice(startPos, endMatch).match(/\:/) && (!(m[0].match(/\: +[A-Z]/)))) {middleTst = false; }
                      if (text.slice(startPos, endMatch).match(/\?/) && (!(m[0].match(/\? +[A-Z]/)))) {middleTst = false; }
                      if (text.slice(startPos, endMatch).match(/\!/) && (!(m[0].match(/\! +[A-Z]/)))) {middleTst = false; }
                      if (text.slice(startPos, endMatch).match(/\-/) && (!(m[0].match(/\- +[A-Z]/)))) {middleTst = false; }
                   }
                   if (!(leftTst*rightTst*middleTst)) {return ''; }
                   this.endMatch = ""+endMatch;
// the wavelength is approximately the 2nd captured group of numbers.  If the wavelength
// is less than 200, then the units are in microns. Otherwise, in angstrom:
                   val = m[2];
                   if (parseInt(val) < 200) {
                       units = 'um';
                       val = val.charAt(0) + '\.' + val.slice(1);
                   } else {
                       units = 'ang';
                       val = val + '0'; }
// some of the names do not accuractely reflect their true central wavelengths, so make corrections:
                   if (val == '2800') {
                       val = '2775';
                   } else if (val == '1.02') {
                       val = '0.95'; }
// Convert the central wavelength/freq/energy into eV energy
                   delta = '25';
                   if (units == 'um') {delta = '0.05'; }
                   info = JSON.parse(extractLineEnergy(val, units, delta));
// for filters, to make sure that they don't end up with exactly same numerical entry as spectral lines, truncate
// them to have only 7 decimal points rather than the spectral line's 8 decimal points:
                   tmp = info[0]
                   tmp = Number(tmp.match(/\d+\.\d+/));  // get the stuff in front of exponential
                   tmp = Number(Math.round(tmp + 'e7') + 'e-7'); // round the value ... shown here is a trick to ensure a ".5" is dealt with accuractly
// attach the properly rounded off and truncated to 7 decimal points value to the exponential stuff:
                   info[0] = tmp + info[0].replace(/\d+\.\d+/,'');
                   idx = info[0];
                   if (val == '0.95' && m[1].charAt(0).match(/g/i)) {
                       xSupp = info[0] + 'X4' + 'high_resolution_grating';
                   } else if (val == '1410' && m[1].charAt(0).match(/g/i)) {
                       xSupp = info[0] + 'X4' + 'low_resolution_grism';
                   } else if (val == '2775' && m[1].charAt(0).match(/g/i)) {
                       xSupp = info[0] + 'X4' + 'grism'
                   } else if (m[1].charAt(0).match(/g/i)) {
                       xSupp = info[0] + 'X4' + 'grating|grism';
                   } else if (m[1].charAt(0).match(/p/i)) {
                       xSupp = info[0] + 'X4' + 'prism'; }
                   xSupp = info[0] + 'X4' + 'hubble_space_telescope_spectrum';
                   xSupp = xSupp + ' ' + info[0] + 'X4' + info[2]; // add spectral region
                   idx = ([... new Set(idx.replace(/^\|/,'').replace(/\|$/,'').split('\|'))]).sort().join('\|');
                   xSupp = ([... new Set(xSupp.replace(/  +/,' ').trim().split(' '))]).sort().join(' ');
                   x = ([... new Set(x.replace(/^\|/,'').replace(/\|$/,'').split('\|'))]).sort().join('\|');
                   this.x = x;
                   this.xSupp = xSupp;
                   this.accuracy = info[1];
                   return idx;  } });
  }
// . . . . . . . . . . GETNCHARS . . . . . . . . . .
  function getNchars(text) {
     var t = text.replace(/^\*/,'').replace(/\\d/g,'0').replace(/\\[ -~]/g,'A');
     t = t.replace(/\([ -~]+(?=\)\{\d+)\)\{(\d+)(?: *\,? *(\d*))?\}/g, function(x,x1,x2) {
         var r = '';
         var maxn = 0;
         if (x2) {maxn = parseInt(x2);}  else {maxn = parseInt(x1); }
         for (var q = 0; q < maxn; q++) {r = r + 'Q'; }
         return r});
     t = t.replace(/\[[ -~]+(?=\]\{\d+)\]\{(\d+)(?: *\,? *(\d*))?\}/g, function(x,x1,x2) {
         var r = '';
         var maxn = 0;
         if (x2) {maxn = parseInt(x2);}  else {maxn = parseInt(x1); }
         for (var q = 0; q < maxn; q++) {r = r + 'R'; }
         return r; });
     t = t.replace(/[ -~]\-[ -~]/g,'\|').replace(/\|\|+/g,'Z');
     t = t.replace(/[^A-Za-z0-9]/g,'').length;
     return t;
  }
// . . . . . . . . . . end GETNCHARS . . . . . . . . . .
// . . . . . . . . . .  EXTRACTLINEENERGY . . . . . . . . . .
// come back here
// you might need to add more code below to cover all the many ways that an angstrom might be
// represented in latex, like \AA
  function extractLineEnergy(value, units, del) {
// the del, in same units as value, is optional
     var energy = '';
     var delta = '';
     var convertFactor = 0;
     var unitName = '';
     var matched = '';
     var thisIdx = '';
     var thisX = '';
     var thisDelta = '';
     var thisEnergy = '';
     var waveFreq = '';
     var tmp = '';
     var tmp1 = 0;
     var tmp2 = 0;
     var i = 0;
     var isSpecial = false;
     var diff = [];
     var tmpDiff = 0;
     var itmp = 0;
     var spectralRegions = ''; // all energies are in eV units
     var gammarayMin = 500*Math.pow(10,3);
     var hardxrayMin = 3*Math.pow(10,3);
     var softxrayMin = 120;
     var euvMin      = planckEv * light/(912.0*Math.pow(10,-10));
     var fuvMin      = planckEv * light/(2000.0*Math.pow(10,-10));
     var nuvMin      = planckEv * light/(3300.0*Math.pow(10,-10));
     var visibleMin  = planckEv * light/(8000.0*Math.pow(10,-10));
     var nirMin      = planckEv * light/(7.0*Math.pow(10,-6));
     var mirMin      = planckEv * light/(25.0*Math.pow(10,-6));
     var firMin      = planckEv * light/(300.0*Math.pow(10,-6));
     var submmMin    = planckEv * light/(1*Math.pow(10,-3));
     if (value.match(/\./)) {
         tmp = Math.pow(10, -1.0*(value.replace(/[0-9]+\./,'').length)); // if 45.066, returns 0.001
     } else {
         tmp = Math.pow(10, value.length-1); // if 45, returns 10
         if (tmp == 1) { // if original number bet/ 1 and 9, delta is +- 0.5
             tmp = 0.5;
         } else if (tmp <= 100) { // if original number bet/ 10 and 100, delta is +/- 1
             tmp = 1;
         } else { // if original number greater than 100, delta is 0.2% (if 5455, tmp = 1000*0.002 = 2)
             tmp = tmp*0.002; }
     }
     if (del !== undefined && del != '') {
         delta = parseFloat(del);
     } else {delta = tmp; }
// Now figure out what the provided units correspond to and how to convert them to basic metric values
// (e.g, gigahertz would have a conversion factor of 10^9 to convert it to hertz)
     if (units.match(/^a/i)) {
         convertFactor = Math.pow(10,-10);
         unitName = 'ang';
         waveFreq = 'w';
     } else if (units.match(/^c/i)) {
         convertFactor = Math.pow(10,-2);
         unitName = 'cm';
         waveFreq = 'w';
     } else if (units.match(/^mil/i) || units.match(/^mm/i)) {
         convertFactor = Math.pow(10,-3);
         unitName = 'mm';
         waveFreq = 'w';
     } else if (units.match(/^mic/i) || units.match(/^um/i) || units.match(/^mu/i)) {
         convertFactor = Math.pow(10,-6);
         unitName = 'um';
         waveFreq = 'w';
     } else if (units.match(/^n/i)) {
         convertFactor = Math.pow(10,-9);
         unitName = 'nm';
         waveFreq = 'w';  }
     if (units.match(/^gh/i) || units.match(/^gigah/i)) {
         convertFactor = Math.pow(10,9);
         unitName = 'ghz';
         waveFreq = 'f';
     } else if (units.match(/^kh/i) || units.match(/^kiloh/i)) {
         convertFactor = Math.pow(10,3);
         unitName = 'khz';
         waveFreq = 'f';
     } else if (units.match(/^th/i) || units.match(/^terah/i)) {
         convertFactor = Math.pow(10,12);
         unitName = 'thz';
         waveFreq = 'f';
     } else if (units.match(/^mh/i) || units.match(/^megah/i)) {
         convertFactor = Math.pow(10,6);
         unitName = 'mhz';
         waveFreq = 'f';
     } else if (units.match(/^ev/i)) {
         convertFactor = Math.pow(10,0);
         unitName = 'ev';
         waveFreq = 'e';
     } else if (units.match(/^kev/i)) {
         convertFactor = Math.pow(10,3);
         unitName = 'kev';
         waveFreq = 'e';   }
// Now compute the energy and associated uncertainty:
     tmp = parseFloat(value);
     if (waveFreq == 'w') {
         energy = (planckEv * light)/ (tmp * convertFactor);
         delta =  (delta * planckEv * light) / (Math.pow(tmp,2) * convertFactor);
     } else if (waveFreq == 'f') {
         energy  = planckEv * convertFactor * tmp;
         delta = planckEv * convertFactor * delta;
     } else if (waveFreq == 'e') {
         energy = convertFactor * tmp;
         delta = convertFactor * delta;   }
// only retain the first significant figure of the accuracy value:
     delta = (''+delta).replace(/([1-9])([0-9]*)\.[0-9]+/,function(x,x1,x2){ // turns 4565.989 into 4000
                 return x1 + x2.replace(/[0-9]/g,'0'); });
     delta = (''+delta).replace(/(0\.[1-9])[0-9]*/,'$1'); // turns 0.84535345 into 0.8
     delta = (''+delta).replace(/(0\.0+[1-9])[0-9]*/,'$1'); // turns 0.000454 into 0.0004
// delta is now a string
//
// let energy always have 8 decimal places when written in exponential form -- overkill in accuracy for the
// full range of values that would be relevant in astronomy, but will help eliminate possibility that 2 completely
// unrelated spectral lines overwrite each other in the index.
     energy = energy.toExponential();
     tmp = Number(energy.match(/\d+\.\d+/));  // get the stuff in front of exponential
     tmp = Number(Math.round(tmp + 'e8') + 'e-8'); // round the value ... shown here is a trick to ensure a ".5" is dealt with accuractly
// attach the properly rounded off and truncated to 8 decimal points value to the exponential stuff:
     energy = tmp + energy.replace(/\d+\.\d+/,'');
// energy is a string
// Now look up what wavelength regime this energy corresponds to, and add that regime to the list to be indexed:
// Possibilities are: "hardxray", "softxray", "euv","fuv", "nuv", "visible", "nir", "mir", "fir", "submm", "radio"
// The definition of the energy/wavelength ranges taken from // http://astronomy.swin.edu.au/~gmackie/MAG/MAG_chap2.pdf
     tmp = parseFloat(energy);
     if (tmp >= gammarayMin) {
     } else if (tmp >= hardxrayMin && tmp < gammarayMin) {
         spectralRegions = "hard_*x_ray";
     } else if (tmp >= softxrayMin && tmp < hardxrayMin) {
         spectralRegions = "soft_*x_ray";
     } else if (tmp >= euvMin && tmp < softxrayMin) {
         spectralRegions = "extreme_*ultraviolet";
     } else if (tmp >= fuvMin && tmp < euvMin) {
         spectralRegions = "far_*ultraviolet";
     } else if (tmp >= nuvMin && tmp < fuvMin) {
         spectralRegions = "near_ultraviolet";
     } else if (tmp >= visibleMin && tmp < nuvMin) {
         spectralRegions = "visible";
     } else if (tmp >= nirMin && tmp < visibleMin) {
         spectralRegions = "near_infrared";
     } else if (tmp >= mirMin && tmp < nirMin) {
         spectralRegions = "*mid_infrared" + '\|' + "thermal_infrared";
     } else if (tmp >= firMin && tmp < mirMin) {
         spectralRegions = "far_infrared" + '\|' + "thermal_infrared";
     } else if (tmp >= submmMin && tmp < firMin) {
         spectralRegions = "*sub_milli_meter";
     } else if (tmp < submmMin) {
         spectralRegions = "radio"; }
     delta = parseFloat(delta).toExponential();
     return JSON.stringify([energy, delta, spectralRegions, waveFreq]);
  }
// . . . . . . . . . . end EXTRACTLINEENERGY . . . . . . . . . .
 // - - - - - - - - - - -  end ADDENTRIES2AT - - - - - - - - - - -
// - - - - - - - - - - - FILTERTHETEXT - - - - - - - - - - -
// This function filters the text using a regex that specifies a list of characters that are
// allowed. Any characters that are NOT allowed are replaced with "" in the filtered text (which
// is returned by this function). This filtering is done by starting at the first character in the
// text and going thru character by character rather than in one fell swoop. Going thru character
// by character generates a record of all the positions (in the original text) of characters that
// passed through the filter (e.g., the allowed characters).
   function filterTheText(reg, text) {
      text = text.replace(/^\*/,'');
      var j = 0;
      var tmp = '';
      var filtered = '';
      var charPos = [];
// make sure that \s and " " mean the same thing:
      var keepTheseChars = reg.replace(/\\s/g," ");
      var whiteSpace = keepTheseChars.match(/ /);
      if (whiteSpace) {
          whiteSpace = ' ';
      } else {
          whiteSpace = ''; }
// normalize the notation within the "regexp" (eg, get rid of unnecessary repetition of backslashes):
      keepTheseChars = new RegExp(keepTheseChars).source;
// Pull out all the characters that are preceded by a "\"
      keepTheseChars = keepTheseChars.match(/\\[ -~]/g);
// if there were matches, make a unique list of these characters:
      if (keepTheseChars) {
          keepTheseChars = ([... new Set(keepTheseChars)]).join('');
          keepTheseChars = new RegExp('[' + keepTheseChars + whiteSpace + "a-zA-Z0-9\|" + ']');
      } else {
          keepTheseChars = new RegExp('[' + whiteSpace + 'a-zA-Z0-9\|' + ']'); }
// Now filter the text so that everything EXCEPT the characters making up the regex are screened out
// of the text before the regex search is applied:
      for (j = 0; j < text.length; j++) { // go through paper's text, one character at a time
          tmp = text.charAt(j).match(keepTheseChars);
          if (tmp) {
              filtered = filtered + text.charAt(j);
              charPos.push(j); } // record the positions of the characters that survive the filter
      }
      return JSON.stringify([filtered, charPos, keepTheseChars.source]);
   }
// - - - - - - - - - - - end FILTERTHETEXT - - - - - - - - - - -
// - - - - - - - - - - -  TESTMATCH - - - - - - - - - - -
 function testMatch(reg, text, startPos) {
     var inCheck = false;
     var endMatch = -1;
     var inText = '';
     var t = JSON.parse(filterTheText(reg, text.slice(startPos)));
     var m = t[0].match(new RegExp('^' + '(?:' + reg + ')'));
     if (m) {
         endMatch = t[1][m[0].length-1] + 1 + startPos;
         inText = text.slice(startPos,endMatch);
// determine if the original, unfiltered text spanning the filtered match text is
// compliant with the set of permitted characters, where "permitted" includes all characters allowed
// in the matched text as well as some other standard characters such as dashes and white space:
         inText = inText.replace(new RegExp(t[2], 'g'), '').replace(/[\- a-zA-Z0-9]/g,'');
         if (inText == '') {
            inCheck = true;
         } else {endMatch = -1; }
     }
     return JSON.stringify([inCheck, endMatch]);
  }
// - - - - - - - - - - - end TESTMATCH - - - - - - - - - - -
// =============== XLTRCHECK ===================
//  %%%%%%%%%%%%%%%%%%%%%%%%  passed 3/22/2019
  function xLtrCheck() {
     var i = 0;
     var j = 0;
     var k = 0;
     var m = 0;
     var l = 0;
     var ast = [];
     var words = '';
     var tmp = '';
     var r = '';
     var left = '';
     var right = '';
     var tleft = '';
     var tright = '';
     var xArr = [];
     var xsArr = [];
     var putInSame = [];
     var wIndx = [];
     var lArr = [];
     var rArr = [];
// Make sure there are no reg fields starting with an asterisked word:
     for (i = 0; i < xLtr.length; i++) {
         if (xLtr[i].reg !== undefined && xLtr[i].reg.match(/^\*[A-Za-z0-9]+$/)) {
             xLtr[i].reg = xLtr[i].reg.replace(/^\*/,'');
// If a "reg" is equal to its "indx", then that word is the same as an astericked word, so make
// sure the indx word has an astericks:
             r = new RegExp(/(^|(?:[\_\| ]))/.source + xLtr[i].reg + /($|(?:[\_\| ]))/.source);
             if (xLtr[i].tIndx !== undefined) {while (xLtr[i].tIndx.match(r)) {xLtr[i].tIndx = xLtr[i].tIndx.replace(r, '$1' + '\*' + xLtr[i].reg + '$2');}}
         }
     }
// Go through the entire xLtr, make a list of all astericked indx words.  Astericked word means
// that the word is not to be looked up in a dictionary but rather to go straight to the index as-is
// Get a list of all the astericked words in the indx, x and xSupp fields:
     ast = xLtr.reduce(function(x1,x2,x3) {
              var tmp;
              var i;
              if (x2.tIndx !== undefined && x2.tIndx.match(/\*/)) {
                   tmp = x2.tIndx.replace(/[\_ ]/g,'\|').replace(/X4/g,'\|').split('\|').filter(z => z.charAt(0) == '\*');
                   for (i = 0; i < tmp.length; i++) {x1.push(tmp[i].replace(/\*/,'')); } }
              if (x2.tX !== undefined && x2.tX.match(/\*/)) {
                   tmp = x2.tX.replace(/[\_ ]/g,'\|').replace(/X4/g,'\|').split('\|').filter(z => z.charAt(0) == '\*');
                   for (i = 0; i < tmp.length; i++) {x1.push(tmp[i].replace(/\*/,'')); } }
              if (x2.tXsupp !== undefined && x2.tXsupp.match(/\*/)) {
                   tmp = x2.tXsupp.replace(/[\_ ]/g,'\|').replace(/X4/g,'\|').replace(/X4/,'\|').split('\|').filter(z => z.charAt(0) == '\*');
                   for (i = 0; i < tmp.length; i++) {x1.push(tmp[i].replace(/\*/,'')); } }
              if (x2.x !== undefined && x2.x.match(/\*/)) {
                   tmp = x2.x.replace(/[\_ ]/g,'\|').replace(/X4/g,'\|').split('\|').filter(z => z.charAt(0) == '\*');
                   for (i = 0; i < tmp.length; i++) {x1.push(tmp[i].replace(/\*/,'')); } }
              if (x2.xSupp !== undefined && x2.xSupp.match(/\*/)) {
                   tmp = x2.xSupp.replace(/[\_ ]/g,'\|').replace(/X4/g,'\|').split('\|').filter(z => z.charAt(0) == '\*');
                   for (i = 0; i < tmp.length; i++) {x1.push(tmp[i].replace(/\*/,'')); } }
              return x1; }, []);
// remove any redundancies:
     ast = [... new Set(ast)];
// Now check for the following inconsistency problem:  a word that will never go into the index is used
// in either the "x" or the "xSupp" field.  Such a word would be a word that exists as a "reg" word, and is
// unassociated with an index equal to the same word (which will be astericked at this point).
// If such a situation exists, remedy by replacing the word with its indx equivalent.
// Get a list of all the "reg" words that are real words not involving code for captured groups.
     words = xLtr.reduce(function(z1,z2,z3) {
                   if (z2.reg !== undefined && z2.reg.match(/^[a-zA-Z0-9]+$/) && z2.tIndx !== undefined) {z1.push(z2.reg); }
                   return z1; }, []);
     words = [... new Set(words.filter(z => z != ''))];
     wIndx = [];
     for (i = 0; i < words.length; i++) {
// For each of the above reg words, get their corresponding indx(s). Keep the word in the array so long as
// the "reg" word is not also included in its own indx:
          tmp = xLtr.reduce(function(z1,z2,z3) {
                       if (z2.reg !== undefined && z2.reg == words[i] && z2.tIndx !== undefined) {z1.push(z2.tIndx.replace(/\*/g,''));}
                       return z1; }, []);
          tmp = [... new Set(tmp.join('\|').replace(/\_/,'\|').split('\|'))];
          if (tmp.indexOf(words[i]) == -1 && tmp.indexOf('\*'+words[i]) == -1) {
              wIndx.push(tmp.join('\|'));
          } else {words[i] = ''; }
     }
     words = words.filter(z => z != '');
// Now determine if any of these "reg" words end up in an "x" or "xSupp" field. If so, replace with
// their associated "index" (stored in wIndx array):
     for (i = 0; i < xLtr.length; i++) {
// remove all astericks (we have already captured a list of all the words that need them), as astericks
// messes up comparisons and the ability to properly do alphanumeric ordering:
         if (xLtr[i].tIndx !== undefined) {xLtr[i].tIndx = xLtr[i].tIndx.replace(/\*/g,''); }
         if (xLtr[i].tX !== undefined) {xLtr[i].tX = xLtr[i].tX.replace(/\*/g,''); }
         if (xLtr[i].tXsupp !== undefined) {xLtr[i].tXsupp = xLtr[i].tXsupp.replace(/\*/g,''); }
         if (xLtr[i].x !== undefined) {xLtr[i].x = xLtr[i].x.replace(/\*/g,'');  }
         if (xLtr[i].xSupp !== undefined) {xLtr[i].xSupp = xLtr[i].xSupp.replace(/\*/g,''); }
         for (j = 0; j < words.length; j++) {
              r = new RegExp(/(^|\_|\|| |(?:X4))/.source + words[j] + /($|\_|\|| |(?:X4))/.source);
              if (xLtr[i].tX !== undefined) {while (xLtr[i].tX.match(r)) {xLtr[i].tX = xLtr[i].tX.replace(r, '$1' + wIndx[j] + '$2');}}
              if (xLtr[i].tXsupp !== undefined) {while (xLtr[i].tXsupp.match(r)) {xLtr[i].tXsupp = xLtr[i].tXsupp.replace(r, '$1' + wIndx[j] + '$2');}}
              if (xLtr[i].x !== undefined) {while (xLtr[i].x.match(r)) {xLtr[i].x = xLtr[i].x.replace(r, '$1' + wIndx[j] + '$2');}}
              if (xLtr[i].xSupp !== undefined) {while (xLtr[i].xSupp.match(r)) {xLtr[i].xSupp = xLtr[i].xSupp.replace(r, '$1' + wIndx[j] + '$2');}}
         }
// Now strip out pairs in xSupp and tXsupp in order to consolidate.
         lArr = [];
         rArr = [];
         if (xLtr[i].xSupp !== undefined && xLtr[i].xSupp.match(/X4/)) {
             tmp = xLtr[i].xSupp.split(' ');
             for (j = 0; j < tmp.length; j++) {
                  left = ([... new Set(tmp[j].split('X4')[0].split('\|'))]).sort();
                  right = ([... new Set(tmp[j].split('X4')[1].replace(/\_/g,'\|').split('\|'))]).sort();
// note that we replace all "_" with "|" for the right side because phrases dont make sense there
                  for (r = 0; r < right.length; r++) {
                       for (l = 0; l < left.length; l++) {
                            lArr.push(left[l]);
                            rArr.push(right[r]); } }
             }
         } else if (xLtr[i].tXsupp !== undefined && xLtr[i].tXsupp.match(/X4/)) {
             tmp = xLtr[i].tXsupp.split(' ');
             for (j = 0; j < tmp.length; j++) {
                  left = ([... new Set(tmp[j].split('X4')[0].split('\|'))]).sort();
                  right = ([... new Set(tmp[j].split('X4')[1].replace(/\_/g,'\|').split('\|'))]).sort();
                  for (r = 0; r < right.length; r++) {
                       for (l = 0; l < left.length; l++) {
                            lArr.push(left[l]);
                            rArr.push(right[r]); } }
             }
         }
// Now go through the pairs, and if there are any phrases in the left side for which some of the
// words appear as individual words for the same right side, then remove those words from the phrases:
         ltmp = [];
         rtmp = [];
         for (l = 0; l < lArr.length; l++) {
              if (lArr[l].length > 0 && lArr[l].match('\_')) { // we've found a phrase
                  tmp = lArr[l].split('\_'); // phrase split out into individual words
                  for (j = 0; j < tmp.length; j++) {
                       k = lArr.reduce(function(z1,z2,z3) {if (z2 == tmp[j] && rArr[z3] == rArr[l]) {z1.push(z3);} return z1; }, []);
                       if (k != '') {tmp[j] = ''; }
                  }
                  tmp = ([... new Set(tmp.filter(z => z != ''))]).sort().join('\_');
                  if (tmp != '') {
                      ltmp.push(tmp);
                      rtmp.push(rArr[l]); }
              } else if (lArr[l].length > 0){
                  ltmp.push(lArr[l]);
                  rtmp.push(rArr[l]); }
         }
// insure that rArr is ordered in alphanumeric order.  Otherwise, the below loop will not work as intended:
         lArr = [ltmp[0]];
         rArr = [rtmp[0]];
         for (j = 1; j < rtmp.length; j++) {
             var  tmp = -1;
             for (k = 0; k < rArr.length; k++) {
                  if (rArr[k] > rtmp[j]) {
                  tmp = k;
                  k = rArr.length;}
             }
             if (tmp != -1) {
                 lArr = lArr.slice(0,tmp).concat([ltmp[j]]).concat(lArr.slice(tmp));
                 rArr = rArr.slice(0,tmp).concat([rtmp[j]]).concat(rArr.slice(tmp));
             } else {
                 lArr = lArr.concat([ltmp[j]]);
                 rArr = rArr.concat([rtmp[j]]); }
         }
// if pairs in xSupp or tXsupp were found, group all the ones together having the same right hand side
         xArr = [];
         if (lArr.length > 0) {
             putInSameX = [];
             putInSameX.push(lArr[0]);
             for (j = 1; j < rArr.length; j++) {
                 if (rArr[j] == rArr[j-1]) {
                     putInSameX[putInSameX.length-1] = ([... new Set((putInSameX[putInSameX.length-1] + '\|' + lArr[j]).split('\|'))]).sort().join('\|'); }
                 if ( (rArr[j] != rArr[j-1]) || (j == rArr.length-1) ) {
                     putInSameX = ([... new Set(putInSameX)]).sort().join('\|');
                     xArr.push(putInSameX + 'X4' + rArr[j-1]);   }
                 if ( (rArr[j] != rArr[j-1]) && (j == rArr.length-1) ) {
                      xArr.push(lArr[j] + 'X4' + rArr[j]);
                 } else if ( (rArr[j] != rArr[j-1]) && (j < rArr.length-1) ) {
                     putInSameX = [];
                     putInSameX.push(lArr[j]);
                    }
             }
             xArr = ([... new Set(xArr)]).sort().join(' ');
             if (xLtr[i].xSupp !== undefined && xLtr[i].xSupp.match(/X4/)) {
                 xLtr[i].xSupp = xArr;
            } else if (xLtr[i].tXsupp !== undefined && xLtr[i].tXsupp.match(/X4/)) {
                 xLtr[i].tXsupp = xArr; }
         }
// Now try to clean up xLtr by consolidating, within a given entry, the x and xSupp field contents:
         if (xLtr[i].tX !== undefined && xLtr[i].tX != '') {
// split up any multiple entries:
              xArr = xLtr[i].tX.split('\|');
// Now go through each one. If there are phrases (words delimited by "_"), arrange the words in those
// phrases in alphanumeric order.
              for (j = 0; j < xArr.length; j++) {xArr[j] = ([... new Set(xArr[j].split('\_'))]).sort().join('\_'); }
// Now remove any duplicative information:
              xArr = ([... new Set(xArr)]).sort();
// If there are words in phrases that also appear separately in the list, remove those words from the phrases:
              for (j = 0; j < xArr.length; j++) {
                   if (xArr[j].match(/\_/)) {
                       tmp = xArr[j].split('\_');
                       for (k = 0; k < tmp.length; k++) {
                            if (xArr.indexOf(tmp[k]) != -1) {tmp[k] = ''; }
                       }
                       xArr[j] = ([... new Set(tmp.filter(z => z != ''))]).sort().join('\_'); }
              }
              xLtr[i].tX = ([... new Set(xArr.filter(z => z != ''))]).sort().join('\_'); }
// And now do a similar thing with the x
         if (xLtr[i].x !== undefined && xLtr[i].x != '') {
              xArr = xLtr[i].x.split('\|');
              for (j = 0; j < xArr.length; j++) {xArr[j] = ([... new Set(xArr[j].split('\_'))]).sort().join('\_'); }
              xArr = ([... new Set(xArr)]).sort();
              for (j = 0; j < xArr.length; j++) {
                   if (xArr[j].match(/\_/)) {
                       tmp = xArr[j].split('\_');
                       for (k = 0; k < tmp.length; k++) {
                            if (xArr.indexOf(tmp[k]) != -1) {tmp[k] = ''; }
                       }
                       xArr[j] = ([... new Set(tmp.filter(z => z != ''))]).sort().join('\_');  }
              }
              xLtr[i].x = ([... new Set(xArr.filter(z => z != ''))]).sort().join('\_'); }
// And also with tIndx
         if (xLtr[i].tIndx !== undefined && xLtr[i].tIndx != '') {
// remove any "_" within the tIndx fields ... phrases don't make sense in this field:
              xArr = xLtr[i].tIndx.replace(/\_/g,'\|').split('\|');
              for (j = 0; j < xArr.length; j++) {xArr[j] = ([... new Set(xArr[j].split('\_'))]).sort().join('\_'); }
              xArr = ([... new Set(xArr)]).sort();
              for (j = 0; j < xArr.length; j++) {
                   if (xArr[j].match(/\_/)) {
                       tmp = xArr[j].split('\_');
                       for (k = 0; k < tmp.length; k++) {
                            if (xArr.indexOf(tmp[k]) != -1) {tmp[k] = ''; }
                       }
                       xArr[j] = ([... new Set(tmp.filter(z => z != ''))]).sort().join('\_');  }
              }
              xLtr[i].tIndx = ([... new Set(xArr.filter(z => z != ''))]).sort().join('\_');  }
// And with any tX that does not have the 'X4' format:
         if (xLtr[i].tX !== undefined && !xLtr[i].tX.match('X4')) {
              xArr = xLtr[i].tX.split('\|');
              for (j = 0; j < xArr.length; j++) {xArr[j] = ([... new Set(xArr[j].split('\_'))]).sort().join('\_'); }
              xArr = ([... new Set(xArr)]).sort();
              for (j = 0; j < xArr.length; j++) {
                   if (xArr[j].match(/\_/)) {
                       tmp = xArr[j].split('\_');
                       for (k = 0; k < tmp.length; k++) {
                            if (xArr.indexOf(tmp[k]) != -1) {tmp[k] = ''; }
                       }
                       xArr[j] = ([... new Set(tmp.filter(z => z != ''))]).sort().join('\_');   }
              }
              xLtr[i].tX = ([... new Set(xArr.filter(z => z != ''))]).sort().join('\_');  }
// And finally with any tXsupp that does not have the 'X4' format:
         if (xLtr[i].tXsupp !== undefined && !xLtr[i].tXsupp.match('X4')) {
              xArr = xLtr[i].tXsupp.split('\|');
              for (j = 0; j < xArr.length; j++) {xArr[j] = ([... new Set(xArr[j].split('\_'))]).sort().join('\_'); }
              xArr = ([... new Set(xArr)]).sort();
              for (j = 0; j < xArr.length; j++) {
                   if (xArr[j].match(/\_/)) {
                       tmp = xArr[j].split('\_');
                       for (k = 0; k < tmp.length; k++) {
                            if (xArr.indexOf(tmp[k]) != -1) {tmp[k] = ''; }
                       }
                       xArr[j] = ([... new Set(tmp.filter(z => z != ''))]).sort().join('\_');  }
              }
              xLtr[i].tXsupp = ([... new Set(xArr.filter(z => z != ''))]).sort().join('\_'); }
 // Now make sure that the same word is astericked in the tIndx, indx, x and tX fields for consistancy:
         for (j = 0; j < ast.length; j++) {
              r = new RegExp(/(^|(?:[\_\| ]))/.source + ast[j] + /($|(?:[\_\| ]))/.source);
              if (xLtr[i].tIndx !== undefined) {while (xLtr[i].tIndx.match(r)) {xLtr[i].tIndx = xLtr[i].tIndx.replace(r, '$1' + '\*' + ast[j] + '$2');}}
              if (xLtr[i].tX !== undefined) {while (xLtr[i].tX.match(r)) {xLtr[i].tX = xLtr[i].tX.replace(r, '$1' + '\*' + ast[j] + '$2');}}
              if (xLtr[i].x !== undefined) {while (xLtr[i].x.match(r)) {xLtr[i].x = xLtr[i].x.replace(r, '$1' + '\*' + ast[j] + '$2');}}
              r = new RegExp(/(^|(?:[\_\| ])|(?:X4))/.source + ast[j] + /($|(?:[\_\| ])|(?:X4))/.source);
              if (xLtr[i].xSupp !== undefined) {while (xLtr[i].xSupp.match(r)) {xLtr[i].xSupp = xLtr[i].xSupp.replace(r, '$1' + '\*' + ast[j] + '$2');}}
              if (xLtr[i].tXsupp !== undefined) {while (xLtr[i].tXsupp.match(r)) {xLtr[i].tXsupp = xLtr[i].tXsupp.replace(r, '$1' + '\*' + ast[j] + '$2');}}
         }
     }
  }
// ////////////////////////// end TRANSLATOR ///////////////////////////////////
