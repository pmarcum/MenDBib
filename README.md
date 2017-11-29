# MenDBib
At the touch of a button, this userscript downloads bibtex content from a Mendeley reference library and writes a "cleaned" bibtex file on Dropbox down in the same folder containing your ShareLaTeX document. You will need to run this code from TamperMonkey (or a similar browser extension). The code, which is geared towards astronomical research,  checks the bibtex entries for compliance with journals such as AJ and ApJ, and imposes a uniform cite key format that guarantees that each reference has a unique cite key without having to resort to attached "a", "b", "c", etc suffixes.  

MenDBib generates 2 files on Dropbox:  the viable bibtex file (called mendbib.bib) and a file (mendbib_prob.bib) that holds any nonviable bibtex entries (these are typically missing one or more required components of information, and/or have typos that need to be corrected).  The code is heavily commented and could also serve as a tutorial for beginners like me who benefit from seeing examples with explanations demonstrating how/why a particular line of code works. (This code is my first javascript program!).  

More info can be found on: https://mendbib.wordpress.com/
