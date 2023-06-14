globalThis.ws_asm  = (function() {
  const builtinMacros = function () {
    return {
      "include": {
        params: ["STRING"],
        action: function (args, builder) {
          const arg = args[1];

          let fileName = arg.token;
          fileName = fileName.slice(1, fileName.length - 1);
          if (!(fileName in builder.includes)) {
            const file = ws_fs.getFile(fileName);
            if (!file) {
              throw "File not found: '" + fileName + "'.";
            }

            builder.includes[fileName] = ws_fs.openFile(file);

            if (builder.includes[fileName]) {
              const srcArr = ws_util.StrArr(builder.includes[fileName]);
              try {
                const ext = ws_asm.compile(builder.includes[fileName], builder);
                builder.externals.push(ext);
              } catch (err) {
                if (err.program) {
                  builder.externals.push(err.program);
                  console.warn("Broken include '" + fileName + "': " + err.message);
                } else {
                  console.error(err);
                  throw "Unknown error loading '" + fileName + "'";
                }
              }
            }
          }
        }
      },
      "macro": {
        params: ["LABEL"],
        action: function (args, builder) {
          const metaTypes = {"$number": "NUMBER", "$label": "TOKEN", "$string": "STRING"};
          const macroLabel = args[1].token.replace(/:$/, "");
          let closed = false;

          const newMacro = {
            tokens: [],
            params: [],
            action: function (args, builder) {
              builder.macroCallCounter = (builder.macroCallCounter || 0) + 1;
              const macroId = builder.macroCallCounter;
              args[0].called = (args[0].called || 0) + 1
              if (args[0].called > 16) {
                throw "Circular reference of macros";
              }

              const toks = [];
              let pp = 1;
              for (const t of this.tokens) {
                const token = Object.assign({}, t);
                if (token.token in metaTypes) {
                  toks.push(args[pp++]);
                } else {
                  if (/^\$\d+$/.test(token.token)) {
                    token.token = ".__" + macroId + "__" + token.token + "__";
                  }
                  toks.push(token);
                }
              }

              builder.tokens = toks.concat(builder.tokens);
            }
          };
          while (true) {
            const token = builder.tokens.shift();
            if (!token) {
              break;
            }
            if (token.type === "MACRO") {
              if (token.token === "$$") {
                closed = true;
                break;
              }
              if (token.token === "include") {
                // do nothing
              } else if (token.token === "$redef") {
                args[1].type = "MACRO";
                newMacro.tokens.push(args[1]);
                continue;
              } else if (token.token in metaTypes) {
                newMacro.params.push(metaTypes[token.token]);
              }
            }
            newMacro.tokens.push(token);
          }
          if (!closed) {
            throw "Macro not closed";
          }

          builder.macros[macroLabel] = newMacro;
        }
      },
      "$$": {
        params: [],
        action: function (args, builder) {
          throw "Unexpected end of macro";
        }
      },
      "$label": {
        params: [],
        action: function (args, builder) {
          throw "Label-pop called outside of a macro";
        }
      },
      "$number": {
        params: [],
        action: function (args, builder) {
          throw "Number-pop called outside of a macro";
        }
      },
      "$string": {
        params: [],
        action: function (args, builder) {
          throw "String-pop called outside of a macro";
        }
      },
      "$redef": {
        params: [],
        action: function (args, builder) {
          throw "Can't redefine macro outside of a macro"
        }
      }
    };
  };

  const mnemo = (function () {
    const mnemoCodes = {};
    // Collect keywords
    for (const keyword of ws.keywords) {
      mnemoCodes[keyword.mnemo] = keyword;
    }

    return mnemoCodes;
  })();

  const parseWhitespace = function (strArr) {
    let space = "";
    while (strArr.hasNext() && /[ \t\n\r]/.test(strArr.peek())) {
      space += strArr.getNext();
    }
    return {
      type: "SPACE",
      token: space
    };
  };

  const parseLineComment = function (strArr) {
    let comment = "";
    do {
      comment += strArr.getNext();
    } while (strArr.hasNext() && strArr.peek() !== '\n');
    return {
      type: "COMMENT",
      token: comment
    };
  };

  const parseMultiLineComment = function (strArr) {
    let comment = "";
    do {
      comment += strArr.getNext();
    } while (strArr.hasNext() && !/{-[\s\S]*-}/.test(comment));
    return {
      type: "COMMENT",
      token: comment
    };
  };

  const parseNumber = function (strArr) {
    let numStr = "";
    while (strArr.hasNext() && /^[+-]?\d*$/.test(numStr + strArr.peek())) {
      numStr += strArr.getNext();
    }

    if (strArr.hasNext() && !/\s|\n|;/.test(strArr.peek())) {
      throw "Invalid character in number format";
    }

    try {
      const data = BigInt(numStr);
      return {
        type: "NUMBER",
        token: numStr,
        data: data
      };
    } catch (err) {
      throw "Illegal number";
    }
  };

  const getStringArray = function (str) {
    const result = [];
    let escape = false;
    let chCode = "";
    for (const ch of str.slice(1, -1)) {
      if (chCode) {
        if (/[0-9]/.test(ch)) {
          chCode += ch;
          continue;
        } else {
          result.push(BigInt(chCode));
          chCode = "";
        }
      }
      if (escape) {
        if (ch === 'n') {
          result.push(BigInt('\n'.charCodeAt(0)));
        } else if (ch === 't') {
          result.push(BigInt('\t'.charCodeAt(0)));
        } else if (/[0-9]/.test(ch)) {
          chCode += ch;
        } else {
          result.push(BigInt(ch.codePointAt(0)));
        }
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else {
        result.push(BigInt(ch.codePointAt(0)));
      }
    }
    if (chCode) {
      result.push(BigInt(chCode));
    }
    if (str[0] === '"') {
      result.push(0n);
    }
    return result;
  };

  const parseString = function (strArr) {
    const strEnd = strArr.peek();
    let str = strArr.getNext();
    let escape = false;
    while (strArr.hasNext() && (escape || strArr.peek() != strEnd)) {
      if (strArr.peek() == '\\') {
        escape = true;
      } else {
        escape = false;
      }
      if (strArr.peek() == '\n' && !escape) {
        throw "Unexpected end of line";
      }
      str += strArr.getNext();
    }
    if (!strArr.hasNext || strArr.peek() != strEnd) {
      throw "Unterminated string";
    } else {
      str += strArr.getNext();
    }
    return {
      type: "STRING",
      token: str
    };
  };

  const parseLabel = function (strArr, builder) {
    let label = "";
    while (strArr.hasNext() && /[0-9a-zA-Z_$.]/.test(strArr.peek())) {
      label += strArr.getNext();
    }

    let type = "TOKEN";
    if (strArr.hasNext()) {
      const next = strArr.peek();
      if (!/\s|\n|:|;/.test(next)) {
        throw "Illegal character";
      } else if (next === ':') {
        strArr.getNext();
        type = "LABEL";
      }
    }

    let op = null;
    if (type === "TOKEN") {
      if (label in mnemo) {
        type = "KEYWORD";
        op = mnemo[label];
      } else if (label in builder.macros) {
        type = "MACRO";
      }
    }

    return {
      type: type,
      token: label,
      op: op
    };
  };

  const getTokens = function (strArr, builder) {
    const tokens = [];
    while (strArr.hasNext()) {
      if (parseWhitespace(strArr).token) {
        continue;
      }
      const meta = {
        line: strArr.line,
        col: strArr.col
      };

      const next = strArr.peek();
      let token = null;
      try {
        if (next === ';' || next === '#' || (next === '-' && strArr.peek(1) === '-')) {
          token = parseLineComment(strArr);
        } else if (next === '{' && strArr.peek(1) === '-') {
          token = parseMultiLineComment(strArr);
        } else if (/["']/.test(next)) {
          token = parseString(strArr);
        } else if (/[-+\d]/.test(next)) {
          token = parseNumber(strArr);
        } else {
          token = parseLabel(strArr, builder);
        }
      } catch (err) {
        if (typeof err === "string") {
          throw {
            tokens: tokens,
            meta: meta,
            message: err + " at line " + meta.line,
            line: meta.line
          }
        } else {
          throw err;
        }
      }

      token.meta = meta;

      if (token.type === "STRING") {
        token.data = getStringArray(token.token);
      }
      if (token.type !== "COMMENT") {
        tokens.push(token);
      }
    }
    return tokens;
  };

  const pushInstruction = function (builder, constr, numberArg) {
    const instruction = new constr();
    if (numberArg != null) {
      instruction.arg = {token: ws_util.getWsSignedNumber(numberArg), value: numberArg};
    }
    builder.pushInstruction(instruction);
  };

  const postProcess = function (builder) {
    while (builder.externals.length > 0) {
      const ext = builder.externals.shift();
      for (const inst of ext.programStack) {
        builder.pushInstruction(inst);
      }
    }
    return builder.postProcess();
  };

  const checkMacroArgs = function (token, builder) {
    const macro = builder.macros[token];
    if (typeof macro.action === "function") {
      let n = 0;
      for (const paramType of macro.params) {
        const arg = builder.tokens[n++];
        if (!arg || arg.type !== paramType) {
          return false;
        }
      }
    }
    return true;
  };

  return {
    compile: function (str, master) {
      const strArr = ws_util.StrArr(str);
      const builder = ws.programBuilder(str, master);
      let tokenError;
      builder.macros = builder.macros || builtinMacros();
      builder.includes = builder.includes || {};
      builder.externals = builder.externals || [];
      try {
        builder.tokens = getTokens(strArr, builder);
      } catch (err) {
        if (err.tokens) {
          builder.tokens = err.tokens;
          tokenError = err;
        } else {
          throw err;
        }
      }
      builder.asmLabeler = builder.asmLabeler || ws_util.labelTransformer(function(counter, label) {
        return ws_util.getWsUnsignedNumber(counter);
      });

      const labeler = builder.asmLabeler;

      let parentLabel = "";

      while (builder.tokens.length > 0) {
        const token = builder.tokens.shift();
        const meta = token.meta;
        try {
          if (token.type === "LABEL") {
            let label = token.token;
            if (ws_util.isLocalLabel(label)) {
              label = parentLabel + label;
            } else {
              parentLabel = label;
            }

            if (typeof builder.labels[labeler.getLabel(label)] === "number") {
              throw "Multiple definitions of label " + label;
            }

            builder.labels[labeler.getLabel(label)] = builder.programStack.length;
            builder.asmLabels[labeler.getLabel(label)] = label;
          } else if (token.op && token.op.constr === ws.WsLabel) {
            const arg = builder.tokens.shift();
            if (!arg) {
              throw "Missing label";
            }
            if (arg.type !== "TOKEN") {
              throw "Invalid label";
            }

            const label = arg.token;
            if (builder.labels[labeler.getLabel(label)]) {
              throw "Multiple definitions of label " + label;
            }

            builder.labels[labeler.getLabel(label)] = builder.programStack.length;
            builder.asmLabels[labeler.getLabel(label)] = label;
          } else if (token.token in builder.macros && checkMacroArgs(token.token, builder)) {
            token.type = "MACRO"; // can be label in some cases
            const macro = builder.macros[token.token];
            if (typeof macro.action === "function") {
              const args = [token];
              for (const paramType of macro.params) {
                const arg = builder.tokens.shift();
                if (!arg || arg.type !== paramType) {
                  throw "Expected " + paramType + " argument";
                } else {
                  args.push(arg);
                }
              }
              macro.action(args, builder);
            } else {
              throw "Unimplemented macro type " + typeof macro.action;
            }
          } else if (token.type === "KEYWORD") {
            const op = token.op;
            let instruction = new op.constr();

            if (op.optParam === 'NUMBER' && builder.tokens[0] && builder.tokens[0].type === op.optParam) {
              pushInstruction(builder, ws.WsPush, builder.tokens.shift().data);
            }

            if (op.param) {
              const arg = builder.tokens.shift();
              if (!arg) {
                throw "Argument expected";
              }
              if (op.param === "NUMBER") {
                if (arg.type === "NUMBER") {
                  pushInstruction(builder, op.constr, arg.data);
                } else if (instruction instanceof ws.WsPush && arg.type === "STRING") {
                  for (let i = arg.data.length - 1; i >= 0; i--) {
                    pushInstruction(builder, op.constr, arg.data[i]);
                  }
                } else {
                  throw "Unexpected token " + arg.token;
                }
              } else if (op.param === "LABEL") {
                instruction = new op.constr();
                let label = arg.token;
                if (ws_util.isLocalLabel(label)) label = parentLabel + label;

                instruction.arg = {
                  token: labeler.getLabel(label), value: null, label: label
                };
                builder.pushInstruction(instruction);
              } else {
                throw "Unsupported argument type " + op.param + " (should never happen)."
              }
            } else {
              pushInstruction(builder, op.constr);
            }
          } else if (token.token in builder.macros) {
            throw "Incorrect argument types for macro " + token.token;
          } else {
            throw "Unexpected token " + token.token;
          }
        } catch (err) {
          if (typeof err === "string") {
            throw {
              program: null,
              line: meta.line,
              message: err + " at line " + meta.line + "."
            };
          } else {
            throw err;
          }
        }
      }

      if (tokenError) {
        throw {
          program: null,
          line: tokenError.meta.line,
          message: tokenError.message
        };
      }

      try {
        return postProcess(builder);
      } catch (err) {
        if (typeof err === "string") {
          throw {
            message: err
          };
        } else {
          throw err;
        }
      }
    }
  };
})();
