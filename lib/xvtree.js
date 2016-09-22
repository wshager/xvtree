'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});
exports.Parser = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

exports.default = parseString;

var _sax = require('sax');

var sax = _interopRequireWildcard(_sax);

var _events = require('events');

var _xvnode = require('xvnode');

var _bom = require('./bom');

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var hasProp = {}.hasOwnProperty;

var Parser = exports.Parser = function (_EventEmitter) {
	_inherits(Parser, _EventEmitter);

	function Parser() {
		_classCallCheck(this, Parser);

		var _this = _possibleConstructorReturn(this, (Parser.__proto__ || Object.getPrototypeOf(Parser)).call(this));

		_this.reset();
		return _this;
	}

	_createClass(Parser, [{
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
			this.saxParser = sax.parser(true, {
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
					ret = ret.concat((0, _xvnode.attribute)(attr.uri ? (0, _xvnode.qname)(attr.uri, attr.name) : attr.name, attr.value));
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
					nodeName = (0, _xvnode.qname)(node.uri, node.name);
				}
				var elm = (0, _xvnode.element)(nodeName, ret);
				return stack.push(elm);
			}.bind(this);
			this.saxParser.onclosetag = function () {
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
			}.bind(this);
			var ontext = function (txt, type) {
				var s = stack[stack.length - 1];
				if (s) {
					if (/\S/.test(txt)) {
						var t;
						if (type == 4) {
							t = (0, _xvnode.cdata)(txt);
						} else if (type == 8) {
							t = (0, _xvnode.comment)(txt);
						} else {
							t = (0, _xvnode.text)(txt);
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
					var t = (0, _xvnode.processingInstruction)(pi.name, pi.body);
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
				str = (0, _bom.stripBOM)(str);
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

function parseString(str, cb) {
	var parser = new Parser();
	return parser.parseString(str, cb);
}