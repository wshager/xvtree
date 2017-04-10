import * as sax from 'sax';

import { EventEmitter } from 'events';

//import { element, attribute, text, cdata, comment, processingInstruction, qname } from 'xvnode';

import { stripBOM } from "./bom";

const hasProp = {}.hasOwnProperty;

function _isSeq(maybe){
	return false;
}

function _isNode(maybe){
	return !!(maybe && maybe.__isNode_Sentinel);
}

/*
if(_isNode(children)){
	super([children]);
} else if(_isSeq(children)){
	var a = children.toArray();
	if(type < 3) {
		a = a.map(_ => _isNode(_) ? _ : text(_));
	}
	super(a);
} else if(children instanceof Array) {
	super(children);
} else if(type==1){
	super([text(children)]);
} else {
	// value
	super([children.toString()]);
}
this.forEach(function(_) {
	if (_isNode(_)) _._parent = this;
},this);
 */

function VNode(map,list,type,name,depth,attrs){
	this._list = list;
	this._map = map;
	this.type = type;
	this.name = name;
	this._depth = depth;
	this._attrs = attrs;
}

export function Node(type, name, vnode, path, index, parent, indexInParent) {
	this.type = type;
	this.name = name;
	this.vnode = vnode;
	// properties below may and should be flushed
	this.path = path;
	this.index = index;
	this.parent = parent;
	this.indexInParent = indexInParent;
}

function _isArray(maybe){
	return !!(maybe && maybe.constructor === Array);
}

function updateMap(map,val){
	let key = val.name;
	// if the value doesn't have a name skip it
	if(key){
		let entry = map.get(key);
		if (entry) {
			if (!_isArray(entry)) entry = [entry];
			entry.push(val);
			map.set(key, entry);
		} else {
			map.set(key, val);
		}
	}
	return map;
}

Node.prototype.push = function(v){
	// allow mutative updates for XML parser
	this._array.push(v);
	this.size++;
};

Node.prototype.value = function value(){
    if(this.type ==  1) return null;
    return this._array;
};

// children is a no-op because it's equal to the node
function serialize(node,indent) {
	indent = indent || 0;
	var type = node._type;
    var v;
	if(type<3 || type == 7){
		var name = node.name();
		if(type==1){
			var children = node;
			var ret = "";
			var attrs = "";
			var hasChildNodes = false;
			children.forEach(function(child,i){
				var type = child._type;
				if(type == 2){
					attrs += " "+serialize(child);
				} else {
					if(type == 1) hasChildNodes = hasChildNodes || true;
					ret += serialize(child,indent+1);
				}
			});
			var dent = "";
			for(var i = 0; i < indent; i++){
				dent += "\t";
			}
			return "\n"+dent+"<"+name+attrs+(ret==="" ? "/>" : ">")+ret+(ret==="" ? "" : (hasChildNodes ? "\n"+dent : "")+"</"+name+">");
		} else if(type == 7){
            v = node.value();
			return "<?"+name+" "+v.replace(/&/g,"&amp;")+"?>";
		} else {
            v = node.value();
			return name+"=\""+v.replace(/&/g,"&amp;")+"\"";
        }
    } else if (type == 3 || type == 4 || type == 7 || type == 8) {
        v = node.value();
        if(type == 4){
            return "<![CDATA["+v+"]]>";
        } else if(type == 8){
            return "<!--"+v+"-->";
        } else {
            return v.replace(/&/g, "&amp;");
        }
	} else {
		return "";
	}
}

function emptyVNode(type,name,depth,attrs){
	return new VNode(Map(),[],type,name,depth,attrs);
}

VNode.prototype.count = function(){
	return this._array.length;
};

VNode.prototype.insert = function(index,vnode){
	this._map = updateMap(this._map,vnode);
	this._list.splice(index,0,vnode);
};

VNode.prototype.append = function(vnode){
	this._map = updateMap(this._map,vnode);
	this._list.push(vnode);
};

export function element(qname, ... children) {
	var node = new Node(function (parent, insertIndex = -1) {
		var attrMap = Map();
		let path = parent.path;
		let pvnode = parent.vnode;
		//let vnode = emptyVNode(1,name,pvnode._depth + 1,attrMap).beginMutation();
		let vnode = emptyVNode(1,name,pvnode._depth + 1, attrMap);
		node.vnode = vnode;
		node.index = path.length;
		node.indexInParent = pvnode.count();
		path.push(node);
		node.path = path;
		for (let i = 0; i < children.length; i++) {
			let child = children[i];
			if (child.type == 2) {
				attrMap.set(child.name, child.value);
			} else {
				child.vnode(node);
			}
		}
		if (insertIndex > -1) {
			node.parent = pvnode.insert(insertIndex, node.vnode);
		} else {
			node.parent = pvnode.append(node.vnode);
		}
		return node;
	}, 1, name);
	return node;
}

export function attribute($qname, $value) {
	return new Node(2, $qname, null, $value);
}

export function text($value) {
	return new Node(3, null, null, $value);
}

export function cdata($value) {
	return new Node(4, null, null, $value);
}

export function comment($value) {
	return new Node(8, null, null, $value);
}

export function processingInstruction($name, $value) {
	return new Node(7, $name, null, $value);
}


export class Parser2 extends EventEmitter {
	constructor() {
		super();
		this.reset();
	}
	assignOrPush(obj, newValue) {
		newValue._parent = obj;
		return obj.push(newValue);
	}
	reset() {
		var stack;
		this.removeAllListeners();
		this.saxParser = sax.parser(true, {
			trim: false,
			normalize: false,
			xmlns: true
		});
		this.saxParser.errThrown = false;
		this.saxParser.onerror = (function(error) {
			this.saxParser.resume();
			if (!this.saxParser.errThrown) {
				this.saxParser.errThrown = true;
				return this.emit("error", error);
			}
		}).bind(this);
		this.saxParser.onend = (function() {
			if (!this.saxParser.ended) {
				this.saxParser.ended = true;
				return this.emit("end", this.resultObject);
			}
		}).bind(this);
		this.saxParser.ended = false;
		this.resultObject = null;
		stack = [];
		this.saxParser.onopentag = (function(node) {
			var nodeName = node.name,
				nodeType = 1;
			var key, ret = [],
				ref = node.attributes;
			// FIXME xmlns attributes are stored!
			for (key in ref) {
				if (!hasProp.call(ref, key)) continue;
				var attr = node.attributes[key];
				if (/json\.org/.test(attr.uri) && attr.local == "type") {
					if (attr.value == "array") {
						nodeType = 5;
					} else if (attr.value == "map") {
						nodeType = 6;
					} else if (attr.value == "literal") {
						nodeType = 12;
					}
				}
				ret = ret.concat(attribute(attr.uri ? qname(attr.uri, attr.name) : attr.name, attr.value));
			}
			if (node.uri) {
				// TODO abuse types deprecated by DOM4
				if (/json\.org/.test(node.uri)) {
					if (node.local == "array") {
						nodeType = 5;
					} else if (node.local == "map") {
						nodeType = 6;
					} else if (node.local == "literal") {
						nodeType = 12;
					}
				}
				nodeName = qname(node.uri, node.name);
			}
			var elm = element(nodeName, ret);
			return stack.push(elm);
		}).bind(this);
		this.saxParser.onclosetag = (function() {
			var emptyStr, err, error1, key, node, nodeName, obj, objClone, old, s, xpath;
			obj = stack.pop();

			s = stack[stack.length - 1];
			if (stack.length > 0) {
				return this.assignOrPush(s, obj);
			} else {
				this.resultObject = obj;
				this.saxParser.ended = true;
				return this.emit("end", this.resultObject);
			}
		}).bind(this);
		var ontext = (function(txt, type) {
			var s = stack[stack.length - 1];
			if (s) {
				if (/\S/.test(txt)) {
					var t;
					if (type == 4) {
						t = cdata(txt);
					} else if (type == 8) {
						t = comment(txt);
					} else {
						t = text(txt);
					}
					t._parent = s;
					s.push(t);
				}
				return s;
			}
		}).bind(this);
		this.saxParser.ontext = ontext;
		this.saxParser.oncdata = function(ctxt) {
			ontext(ctxt, 4);
		};
		this.saxParser.onprocessinginstruction = function(pi) {
			var s = stack[stack.length - 1];
			if (s) {
				var t = processingInstruction(pi.name, pi.body);
				t._parent = s;
				s.push(t);
			}
			return s;
		};
		this.saxParser.oncomment = function(ctxt) {
			ontext(ctxt, 8);
		};
	}
	parseString(str, cb) {
		if ((cb !== null) && typeof cb === "function") {
			this.on("end", function(result) {
				this.reset();
				return cb(null, result);
			});
			this.on("error", function(err) {
				this.reset();
				return cb(err);
			});
		}
		try {
			str = str.toString();
			if (str.trim() === '') {
				this.emit("end", null);
				return true;
			}
			str = stripBOM(str);
			return this.saxParser.write(str).close();
		} catch (err) {
			if (!(this.saxParser.errThrown || this.saxParser.ended)) {
				this.emit('error', err);
				this.saxParser.errThrown = true;
				return true;
			} else if (this.saxParser.ended) {
				throw err;
			}
		}
	}
}

const saxParser = sax.parser(true, {
	trim: false,
	normalize: false,
	xmlns: true
});

class Parser extends EventEmitter {
	constructor() {
		super();
		this.reset();
	}
	reset() {
		var doc = emptyVNode(9,"#document",-1,ohamt.empty.beginMutation()).beginMutation(), depth = 0;
		var last = doc, parents = [];
		this.removeAllListeners();
		saxParser.errThrown = false;
		saxParser.onerror = (function(error) {
			saxParser.resume();
			if (!saxParser.errThrown) {
				saxParser.errThrown = true;
				return this.emit("error", error);
			}
		}).bind(this);
		saxParser.ended = false;
		saxParser.onopentag = (function(node) {
			var nodeName = node.name,
				nodeType = 1;
			depth++;
			var key, ref = node.attributes;
			// FIXME xmlns attributes are stored!
			if (node.uri) {
				// TODO abuse types deprecated by DOM4
				if (/json\.org/.test(node.uri)) {
					if (node.local == "array") {
						nodeType = 5;
					} else if (node.local == "map") {
						nodeType = 6;
					} else if (node.local == "literal") {
						nodeType = 12;
					}
				}
				//nodeName = qname(node.uri, node.name);
			}
			let attrMap = Map();
			for (key in ref) {
				if (!hasProp.call(ref, key)) continue;
				var attr = node.attributes[key];
				if (/json\.org/.test(attr.uri) && attr.local == "type") {
					//var last = nodes.size-1;
					if (attr.value == "array") {
						nodeType = 5;
					} else if (attr.value == "map") {
						nodeType = 6;
					} else if (attr.value == "literal") {
						nodeType = 12;
					}
				}
				//ret = ret.concat(attribute(attr.uri ? qname(attr.uri, attr.name) : attr.name, attr.value));
				attrMap.set(attr.name,attr.value);
			}
			let n = emptyVNode(nodeType,nodeName,depth,attrMap.endMutation(true)).beginMutation();
			if(last) {
				last = last.append(n);
				parents.push(last);
			}
			last = n;
		}).bind(this);
		saxParser.onclosetag = function() {
			depth--;
			// here we can be sure that mutation has stopped
			// BUT the problem is now that last children's parents are still mutable
			// that's why we retain properties, because we won't be mutating until parsing is done
			last = last.endMutation(true);
			last = parents.pop();
		};
		saxParser.onend = (function() {
			saxParser.ended = true;
			let doc = last.endMutation(true);
			doc._attrs = last._attrs.endMutation(true);
			return this.emit("end", doc);
		}).bind(this);
		var ontext = function(value, type=3) {
			if (/\S/.test(value)) {
				let n = new TextNode(type,value,depth+1);
				last = last.append(n);
			}
		};
		saxParser.ontext = ontext;
		saxParser.oncdata = function(value) {
			ontext(value, 4);
		};
		saxParser.ondoctype = function(value){
			last._attrs = last._attrs.set("DOCTYPE",value);
		};
		saxParser.onprocessinginstruction = function(pi) {
			last._attrs = last._attrs.set(pi.name,pi.body);
		};
		saxParser.oncomment = function(value) {
			ontext(value, 8);
		};
	}
	parseString(str, cb) {
		if ((cb !== null) && typeof cb === "function") {
			this.on("end", function(result) {
				this.reset();
				return cb(null, result);
			});
			this.on("error", function(err) {
				this.reset();
				return cb(err);
			});
		}
		try {
			str = str.toString();
			if (str.trim() === '') {
				this.emit("end", null);
				return true;
			}
			str = stripBOM(str);
			if(saxParser.closed) {
				saxParser.onready = function(){
					saxParser.onready = null;
					saxParser.write(str).close();
				};
			} else {
				return saxParser.write(str).close();
			}
		} catch (err) {
			if (!(saxParser.errThrown || saxParser.ended)) {
				this.emit('error', err);
				saxParser.errThrown = true;
				return true;
			} else if (saxParser.ended) {
				throw err;
			}
		}
	}
}

export function parseString(str, cb) {
    var parser = new Parser();
    return parser.parseString(str, cb);
}
