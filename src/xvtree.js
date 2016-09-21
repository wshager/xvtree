import * as sax from 'sax';

import { EventEmitter } from 'events';

import { setImmediate } from 'timers';

import { stripBOM, element, attribute, text, cdata, comment, processingInstruction, qname } from './xml-utils';

const hasProp = {}.hasOwnProperty;

export class Parser extends EventEmitter {
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

export default function parseString(str, cb) {
    var parser = new Parser();
    return parser.parseString(str, cb);
}
