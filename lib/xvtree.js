'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});
exports.Parser = undefined;

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

exports.default = parseString;

var _sax = require('sax');

var sax = _interopRequireWildcard(_sax);

var _events = require('events');

var _timers = require('timers');

var _immutable = require('immutable');

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var hasProp = {}.hasOwnProperty;

function stripBOM(str) {
	if (str[0] === '﻿') {
		return str.substring(1);
	} else {
		return str;
	}
}

function isNode(maybe) {
	return !!(maybe && maybe._isNode);
}

var Node = function (_Seq) {
	_inherits(Node, _Seq);

	function Node(type, name, attrs, children) {
		var _ret;

		_classCallCheck(this, Node);

		var _this = _possibleConstructorReturn(this, (Node.__proto__ || Object.getPrototypeOf(Node)).call(this, _immutable.Seq.isSeq(children) ? children.toArray() : children instanceof Array ? children : [children]));

		_this.forEach(function (_) {
			if (isNode(_)) _._parent = this;
		}, _this);
		_this._name = name;
		_this._attrs = attrs;
		_this._isNode = true;
		_this._type = type;
		_this._cache = {}; // for select by name
		_this._owner = null; // TODO have elem create it, or explicitly through createDocument
		_this._parent = null;
		return _ret = _this, _possibleConstructorReturn(_this, _ret);
	}

	return Node;
}(_immutable.Seq);

var QName = function QName(uri, name) {
	_classCallCheck(this, QName);

	this._isQName = true;
	this._name = name;
	this._uri = uri;
};

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

var Parser = exports.Parser = function (_EventEmitter) {
	_inherits(Parser, _EventEmitter);

	function Parser(opts) {
		var _ret2;

		_classCallCheck(this, Parser);

		var key, ref, value;

		var _this2 = _possibleConstructorReturn(this, (Parser.__proto__ || Object.getPrototypeOf(Parser)).call(this));

		_this2.options = {};
		ref = defaults;
		for (key in ref) {
			if (!hasProp.call(ref, key)) continue;
			value = ref[key];
			_this2.options[key] = value;
		}
		for (key in opts) {
			if (!hasProp.call(opts, key)) continue;
			value = opts[key];
			_this2.options[key] = value;
		}
		_this2.reset();
		return _ret2 = _this2, _possibleConstructorReturn(_this2, _ret2);
	}

	_createClass(Parser, [{
		key: 'processAsync',
		value: function processAsync() {
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
					return (0, _timers.setImmediate)(this.processAsync);
				}
			} catch (err) {
				if (!this.saxParser.errThrown) {
					this.saxParser.errThrown = true;
					return this.emit(err);
				}
			}
		}
	}, {
		key: 'assignOrPush',
		value: function assignOrPush(obj, newValue) {
			newValue._parent = obj;
			return obj.push(newValue);
		}
	}, {
		key: 'reset',
		value: function reset() {
			var stack;
			this.removeAllListeners();
			this.saxParser = sax.parser(this.options.strict, {
				trim: false,
				normalize: false,
				xmlns: true
			});
			this.saxParser.errThrown = false;
			this.saxParser.onerror = function (error) {
				this.saxParser.resume();
				if (!this.saxParser.errThrown) {
					this.saxParser.errThrown = true;
					return this.emit("error", error);
				}
			}.bind(this);
			this.saxParser.onend = function () {
				if (!this.saxParser.ended) {
					this.saxParser.ended = true;
					return this.emit("end", this.resultObject);
				}
			}.bind(this);
			this.saxParser.ended = false;
			this.resultObject = null;
			stack = [];
			this.saxParser.onopentag = function (node) {
				var nodeName = node.name,
				    nodeType = 1;
				var key,
				    ret = [],
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
			}.bind(this);
			this.saxParser.onclosetag = function () {
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
			}.bind(this);
			var ontext = function (txt, type) {
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
			}.bind(this);
			this.saxParser.ontext = ontext;
			this.saxParser.oncdata = function (ctxt) {
				ontext(ctxt, 4);
			};
			this.saxParser.onprocessinginstruction = function (pi) {
				var s = stack[stack.length - 1];
				if (s) {
					var t = processingInstruction(pi.name, pi.body);
					t._parent = s;
					s.push(t);
				}
				return s;
			};
			this.saxParser.oncomment = function (ctxt) {
				ontext(ctxt, 8);
			};
		}
	}, {
		key: 'parseString',
		value: function parseString(str, cb) {
			if (cb !== null && typeof cb === "function") {
				this.on("end", function (result) {
					this.reset();
					return cb(null, result);
				});
				this.on("error", function (err) {
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
					(0, _timers.setImmediate)(this.processAsync);
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
	}]);

	return Parser;
}(_events.EventEmitter);

function parseString(str, a, b) {
	var cb, options;
	if (b !== null) {
		if (typeof b === 'function') {
			cb = b;
		}
		if ((typeof a === 'undefined' ? 'undefined' : _typeof(a)) === 'object') {
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