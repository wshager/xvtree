import * as sax from 'sax';

import { EventEmitter } from 'events';

import { setImmediate } from 'timers';

import { Seq } from 'immutable';

const hasProp = {}.hasOwnProperty;

function stripBOM(str) {
	if (str[0] === '\uFEFF') {
		return str.substring(1);
	} else {
		return str;
	}
}

function isNode(maybe){
	return !!(maybe && maybe._isNode);
}

class Node extends Seq {
	constructor(type, name, attrs, children) {
		super(Seq.isSeq(children) ? children.toArray() : children instanceof Array ? children : [children]);
		this.forEach(function(_) {
			if (isNode(_)) _._parent = this;
		},this);
		this._name = name;
		this._attrs = attrs;
		this._isNode = true;
		this._type = type;
		this._cache = {}; // for select by name
		this._owner = null; // TODO have elem create it, or explicitly through createDocument
		this._parent = null;
		return this;
	}
}

class QName {
	constructor(uri,name){
        this._isQName = true;
		this._name = name;
        this._uri = uri;
	}
}

function element($qname, $children) {
	return new Node(1, $qname, null, $children);
}

function attribute($qname, $value) {
	return new Node(2, $qname, null, $value);
}

function text($value) {
	return new Node(3, null, null, $value);
}

function cdata($value) {
	return new Node(4, null, null, $value);
}

function comment($value) {
	return new Node(8, null, null, $value);
}

function processingInstruction($name, $value) {
	return new Node(7, $name, null, $value);
}

function qname($uri, $name) {
    return new QName($uri, $name);
}


var defaults = {
	validator: null,
	xmlns: true,
	async: false,
	strict: true,
	chunkSize: 10000
};

export class Parser extends EventEmitter {
	constructor(opts) {
		var key, ref, value;
		super();
		this.options = {};
		ref = defaults;
		for (key in ref) {
			if (!hasProp.call(ref, key)) continue;
			value = ref[key];
			this.options[key] = value;
		}
		for (key in opts) {
			if (!hasProp.call(opts, key)) continue;
			value = opts[key];
			this.options[key] = value;
		}
		this.reset();
		return this;
	}
	processAsync() {
		var chunk;
		try {
			if (this.remaining.length <= this.options.chunkSize) {
				chunk = this.remaining;
				this.remaining = '';
				this.saxParser = this.saxParser.write(chunk);
				return this.saxParser.close();
			} else {
				chunk = this.remaining.substr(0, this.options.chunkSize);
				this.remaining = this.remaining.substr(this.options.chunkSize, this.remaining.length);
				this.saxParser = this.saxParser.write(chunk);
				return setImmediate(this.processAsync);
			}
		} catch (err) {
			if (!this.saxParser.errThrown) {
				this.saxParser.errThrown = true;
				return this.emit(err);
			}
		}
	}
	assignOrPush(obj, newValue) {
		newValue._parent = obj;
		return obj.push(newValue);
	}
	reset() {
		var stack;
		this.removeAllListeners();
		this.saxParser = sax.parser(this.options.strict, {
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
			//console.log(nodeType,nodeName);
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
				this.resultObject = obj.asImmutable();
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
			if (this.options.async) {
				this.remaining = str;
				setImmediate(this.processAsync);
				return this.saxParser;
			}
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

export default function parseString(str, a, b) {
    var cb, options;
    if (b !== null) {
    	if (typeof b === 'function') {
    		cb = b;
    	}
    	if (typeof a === 'object') {
    		options = a;
    	}
    } else {
    	if (typeof a === 'function') {
    		cb = a;
    	}
    	options = {};
    }
    var parser = new Parser(options);
    return parser.parseString(str, cb);
}
