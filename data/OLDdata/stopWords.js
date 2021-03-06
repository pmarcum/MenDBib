var stopWords =
       'a|able|about|academia|' +
            'achieve|achieved|achieves|achieving|acknowledge|acknowledges|acknowledged|acknowledging|' +
            'ago|al|albeit|along|already|also|although|american|amounting|amounted|an|and|anecdotal|' +
            'another|annals|any|anybody|anyone|anything|anywhere|appendix|appendices|' +
            'appreciable|appreciate|appreciated|appreciates|appreciating|appreciably|' +
            'approached|approaches|approaching|approach|appropriate|approximate|approximately|approximated|' +
            'approximation|approximations|applied|apply|applying|april|apr|arbitrary|arbitrarily|' +
            'are|arent|arcsecond|arcseconds|arcsec|arcsecs|arcminute|arcminutes|arcmin|arcmins|argue|' +
            'argues|argued|arguably|arise|arises|arose|arisen|arising|arrow|arrows|article|articles|' +
            'as|asc|ascension|aside|ask|asked|asking|asks|assess|assesses|assessed|assessing|' +
            'assure|assures|assuring|at|attain|attains|attained|attaining|attempt|attempts|attempted|' +
            'attempting|attributed|attributing|attribution|attributions|august|aug|award|awards|' +
            'awarded|awarding|author|authors|average|away|automatically|' +
        'backed|backing|backs|bad|barely|based|basic|basically|be|became|because|become|becomes|' +
            'been|before|began|begin|begins|being|beings|believed|believe|best|better|bigger|bold|boldly|boldness|boldface|' +
            'boldfaced|bookkeeping|bring|brings|bringing|brought|broadly|but|by|' +
        'call|came|can|cannot|cant|caption|captions|captioned|care|cared|careful|carefully|case|cases|' +
            'cause|causes|caused|causing|certain|certainly|chance|chances|chanced|cheap|cheapest|cheaper|' +
            'cheapen|clear|clearly|closing|cm|cm2|cm3|college|collaborate|collaborates|collaborated|' +
            'collaborating|collaboration|collaborations|come|comes|coming|comment|commented|commments|' +
            'commenting|community|communities|compelling|conceive|conceives|conceived|conceiving|' +
            'conceivably|conception|concise|concisely|conclude|concludes|concluded|concurrent|' +
            'consequently|consider|considers|considered|considering|consideration|consist|consisted|' +
            'consists|consisting|consistency|convenient|convenience|conveniences|conveniently|' +
            'convince|convinced|convinces|convincing|convincingly|corporated|corporation|corporations|' +
            'corresponding|could|council|councils|counsel|counsels|counseling|currently|' +
        'dash|dashed|dd|debate|debates|debating|debated|december|dec|decide|decides|decided|deciding|' +
            'decision|decisions|declare|delared|declares|declaring|declaration|declarations|' +
            'declination|declinations|dec|decl|deliberate|deliberately|demand|demands|demanded|' +
            'demanding|demonstrate|demonstrates|demonstrated|demonstrating|demonstration|department|' +
            'departments|depart|departed|departs|departing|describe|describes|described|describing|description|' +
            'designate|designation|designated|designations|designating|desire|desires|desiring|desired|' +
            'detail|details|detailing|detailed|determine|determines|determining|determined|' +
            'dex|did|didnt|discern|discerns|discerned|discerning|discernment|discuss|discussed|' +
            'discussing|discusses|distain|distains|do|does|doesnt|done|dont|dot|dots|dotted|' +
            'download|downloads|downloading|downloaded|dozen|dozens|during|' +
            'dramatic|dramatically|draw|drawn|drew|draws|drawing|due|' +
        'each|easy|easier|easily|edition|eg|e\.g\.|eight|either|else|elsewhere|employ|employs|employed|employing|' +
            'enable|enabling|enabled|enables|endure|endures|enduring|endured|enlighten|enlightened|' +
            'enough|ensure|enter|enters|entry|entered|entering|entrance|especially|esp|et|etc|' +
            'eventual|eventually|ever|everybody|everyone|everything|evidently|excellence|excellent|' +
            'express|expresses|expressed|expressing|expression|expressions|expressive|' +
            'extravagant|' +
        'fact|facts|fair|fairly|faired|famous|famously|february|feb|feel|feels|fellowship|fellowships|felt|' +
            'figure|figures|finally|financial|financially|finances|financed|financing|firstly|' +
            'finish|finishes|finished|finishing|for|forth|forthcoming|fortuitous|fortuitously|foundation|' +
            'foundations|four|fifth|five|from|fruit|fruits|fruitful|fulfillment|fund|funded|funds|funding|' +
            'further|fully|farther|furthered|furthering|furthers|furthermore|' +
        'gave|general|generally|generality|generalities|generous|generosity|genuine|genuinely|' +
            'gently|gentle|gentler|get|gets|ghz|gigayear|gigayears|give|gives|given|' +
            'gm|gms|graduate|graduates|gram|grams|gm2|gm3|go|going|good|got|gradually|grateful|gratefully|' +
            'greatly|genuine|genuinely|grant|grants|granted|granting|guess|guessing|guessed|guesses|guestimate|' +
            'gy|gyr|gyrs|gys|' +
        'had|happen|happens|happened|happening|happy|happily|has|hasnt|hasten|hastens|hastening|' +
            'have|having|he|help|helps|helped|helping|helpful|helpfully|henceforth|her|here|herself|hence|' +
            'him|himself|hint|hints|hinted|hinting|his|hour|hours|hr|hrs|how|however|http|huge|hz|' +
        'i|ie|i\.e\.|if|illustrate|illustrated|illustrating|illustrates|illustrative|imagine|imagines|' +
            'imagining|imagined|imagination|' +
            'immediate|immediately|impartial|impartially|implement|implemented|implements|' +
            'implementing|implementation|important|importance|impose|imposed|imposing|imposes|' +
            'impossible|impossibility|impossibilities|impressive|impress|impresses|impressed|' +
            'impressing|implication|imply|implying|implied|implies|in|inc|incapable|incipient|' +
            'indeed|industry|industries|industrial|industrialized|insist|insists|insisting|insisted|' +
            'instance|instances|instead|institute|institution|institutions|institutes|' +
            'institutional|instituted|instituting|intend|intends|intended|intending|intent|' +
            'intents|intention|intentions|intentional|intentionally|interest|interesting|interests|' +
            'international|intervene|intervenes|intervened|intervening|into|intrigue|intriguing|intrigued|' +
            'intrigues|introduction|intro|introductory|introduce|introduces|introduced|introducing|' +
            'intuitive|intuitively|intuit|intuits|invaluable|investigate|investigates|investigated|' +
            'investigating|investigation|investigator|investigators|invite|invitation|invites|invited|' +
            'inviting|invitations|invitational|is|issued|issuing|it|its|itself|' +
        'jansky|janskies|january|jan|journal|journals|june|jun|july|jul|just|justice|justification|' +
            'justify|justified|justifies|justifying|jy|' +
        'key|kind|kindly|kinds|khz|km|km2|km3|kpc|kpc2|kpc3|' +
        'latter|later|latest|less|let|lets|like|likes|liked|liking|likely|likewise|linger|lingers|' +
            'lingered|lingering|list|lists|listed|listing|listings|litany|look|looked|looks|looking|' +
        'm|m2|m3|mm|mm2|mm3|made|main|make|making|mainly|maintain|maintains|maintained|maintaining|' +
            'maintenance|manage|manages|managed|managing|many|manuscript|manuscripts|march|mar|marginal|' +
            'marked|marking|matters|materially|mattered|mattering|may|me|meaningful|meaningfully|' +
            'megaparsec|megaparsecs|mental|mentally|mention|mentions|mentioned|mentioning|mere|merely|' +
            'meter|meters|metre|metres|millijansky|millijanskys|mhz|mjy|middle|might|minute|minutes|' +
            'min|mine|minus|mins|miriad|mislead|misleads|modern|more|moreover|mostly|motive|motivate|museum|museums|' +
            'motivates|motivating|motivated|mpc|mpc2|mpc3|much|must|my|myself|' +
        'national|nationally|nearly|necessarily|necessity|need|needed|needing|needs|neglect|' +
            'neither|nevertheless|news|next|nice|nicely|nine|nobody|noone|none|nor|not|notable|notably|' +
            'note|notes|noted|noting|nothing|notwithstanding|notices|november|nov|now|' +
            'nowhere|number|numbers|numerously|' +
        'obey|obeys|obeyed|obeying|object|objects|obtain|obtains|obtained|obtaining|obviously|occasion|' +
            'occasional|occasions|occasionally|oclock|october|oct|of|offer|offers|offered|offering|on|online|or|other|' +
            'others|otherwise|our|ours|out|outlandish|owe|owing|owes|owed|' +
        'page|pages|paginate|paginated|paginates|pagination|paper|papers|parsec|parsecs|parenthesis|participate|' +
            'participated|participates|participating|participant|participants|parting|partly|particular|' +
            'particularly|partnership|partnerships|pc|per|perceive|perceived|perceives|perceiving|perception|perceptions|' +
            'perfectly|perfected|perfect|perfecting|perfects|perfected|perhaps|permission|permissions|' +
            'persuade|persuades|persuaded|persuasive|philosophy|philosophies|place|placed|places|plausible|plausibility|' +
            'plausibilities|plus|premise|premises|prepare|prepares|prepared|preparing|preparation|' +
            'preparations|present|presently|presents|presented|presenting|presume|presumably|presuming|presumed|presumes|' +
            'probably|problematic|proceed|proceeds|proceeding|proceedings|proceeded|professor|professors|' +
            'professorship|professorships|promise|promises|promised|promising|proposal|proposals|propose|' +
            'proposes|proposed|proposing|provenance|provanences|provential|provisional|provide|provides|provided|public|' +
            'publicly|publish|published|publishing|publishes|purely|push|pushed|pushes|pushing|put|puts|putative|' +
        'qualitative|qualitatively|quite|' +
        'rather|reach|reaching|reaches|reached|read|reads|reading|reader|readers|readily|really|realworld|reasonable|' +
            'reasonably|reason|reassure|receive|receives|received|receiving|reception|receptions|refer|referred|referring|' +
            'refers|reference|references|referenced|referencing|re|referee|referees|refine|refined|refining|refines|' +
            'regarding|regards|regard|regardless|remark|remarks|remarking|remarked|remarkable|remarkably|remind|' +
            'reminds|reminding|reminded|reminder|reminders|renown|repeat|repeated|repeating|repeats|report|reports|' +
            'reported|reporting|researcher|researchers|respect|respects|respected|respecting|respective|respectively|' +
            'result|results|reveal|reveals|revealing|revealed|review|reviews|reviewed|reviewing|richer|rigor|' +
            'rigorous|rigorously|room|roughly|routinely|' +
        's|ss|sabbatical|safely|said|saw|say|says|sec|secs|second|secondly|seconds|see|seek|seeks|seeking|seem|seemed|' +
            'seeming|seemingly|seems|sees|september|sept|sep|serious|seriously|session|sessions|seven|six|shaded|shall|she|shortly|should|' +
            'show|showed|showing|shown|shows|society|societies|some|somehow|somewhat|sometime|sometimes|somewhere|someone|something|' +
            'soon|sooner|soonest|sought|speak|speaks|speaking|speaker|speakers|speculate|speculates|speculated|speculating|' +
            'spoke|spoken|statement|statements|states|stating|stated|study|studies|studied|studying|student|students|' +
            'straightforward|stringent|subject|subjected|subjects|subjecting|submm|submillimeter|submillimetre|' +
            'subsequent|subsequently|substantial|substantially|substantiate|substantiated|substatiates|substantiating|such|' +
            'suffer|suffered|suffering|suffers|sufficient|suffice|suffices|sufficed|suggest|suggests|suggested|suggesting|' +
            'suggestion|suggestions|suggestive|suit|suits|suited|suiting|summary|summarize|summarized|summarizes|summaries|' +
            'suppose|supposes|supposed|supposing|supposition|suppositions|sure|surprise|surprises|surprised|' +
            'surprising|surprisingly|symposium|symposia|symposiums|' +
        'take|takes|taken|taking|tantalizingly|tantalizing|tantalize|tantalizes|tantalized|tantamount|target|targets|' +
            'targetted|targetting|team|teams|ten|than|thank|thanks|thanking|thanked|thankful|thankfully|that|the|their|them|' +
            'themself|themselves|theyre|then|thence|there|thereafter|therefore|therefrom|therein|these|they|thesis|' +
            'thing|things|think|thinks|third|this|thorough|thoroughly|those|though|thought|thoughts|thoughtful|' +
            'thoughtfully|three|through|throughout|thus|to|together|too|took|total|travel|travels|travelled|travelling|' +
            'treat|treats|treated|treating|true|truly|try|tries|trying|tried|turn|turns|turning|turned|two|typical|typically|' +
        'ultimate|ultimately|unable|unambiguous|unambiguously|underline|underlined|undergraduate|undergraduates|' +
            'underscore|underscored|understand|understands|understanded|understanding|understandable|understood|' +
            'undertake|undertakes|undertaking|undertook|unfortunately|unfortunate|university|unlike|unliked|unlikely|' +
            'unpublished|unshaded|until|unwelcome|unwelcomed|upon|usually|us|' +
        'valued|version|versions|versus|very|via|view|views|viewed|viewing|visitor|visitors|vs|' +
        'want|wanted|wanting|wants|was|we|well|welcome|welcomed|welcoming|welcomes|went|were|what|whatever|when|' +
            'whenever|where|whereas|whether|which|whichever|while|who|whole|whose|why|will|with|within|' +
            'without|word|worse|worst|would|wouldnt|www|' +
        'yet|yield|yields|yielded|yielding|you|your|yours|year|yr|yy|' +
        'america|american|ames|arizona|' +
        'baltimore|boston|' +
        'california|caltech|cambridge|canada|chicago|china|chinese|columbia|' +
        'dc|'
        'england|europe|european|' +
        'florida|france|french|' +
        'germany|german|goddard|' +
        'hawaii|hawaian|hopkins|' +
        'ipac|irsa|italy|italian|' +
        'korea|korean|' +
        'japan|japanese|'
        'mexico|mexican|mpa|' +
        'nasa|naval|navy|' +
        'observatory|ohio|' +
        'philadelphia|pittsburgh|portsmouth|potsdam|princeton|' +
        'stsci|' +
        'tucson|' +
        'washington|';
