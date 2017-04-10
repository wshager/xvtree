var xvtree = require("../lib/xvtree");
var fs = require("fs");
var parser = new xvtree.Parser();
var s = new Date();
function parse(xml){
	parser.parseString(xml,function(err,doc){
		if(err) return console.error(err);
		console.log(doc.toString());
		console.log(new Date() - s);
	});
}

var html = fs.readFileSync(__dirname+"/test.html",'utf-8',function(err){
    if(err) throw new Error(err);
});

parse(html);
