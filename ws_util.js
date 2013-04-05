var ws_util = (function () {
  return {
    getWsUnsignedNumber: function (num) {
      var result = "";
      while (num > 0) {
        result = ((num & 1) ? '\t' : ' ') + result;
        num >>= 1;
      }
      return result + '\n';
    },
    getWsSignedNumber: function (num) {
      return ((num >= 0) ? ' ' : '\t') + this.getWsUnsignedNumber(Math.abs(num));
    },
    labelTransformer: function (labelGenerator) {
      var length = 0;
      return {
        length: length,
        labels: {},
        getLabel: function (label) {
          if (label in this.labels) {
            return this.labels[label];
          } else {
            var gen = labelGenerator(length++);
            this.labels[label] = gen;
            return gen;
          }
        }
      };
    },
    getFilename: function (path) {
      return path.replace(/^(?:.*[\/\\])?((?:[^\/\\])*)$/, '$1');
    },
    handleOverflow: function(selector) {
      var selector$ = $(selector);

      if (selector$[0].scrollHeight > selector$.height()) {
        selector$.css('overflow-y', 'scroll');
      } else {
        selector$.css('overflow-y', 'hidden');
      }
    },
    StrArr: function(str) {
      return {
        arr: str.split(''),
        pos: 0,
        line: 1,
        col: 1,
        hasNext: function  () {
          return this.pos  < this.arr.length;
        },
        getNext: function  () {
          var next = this.arr[this.pos++];
          if (next == '\n') {
            this.line++;
            this.col = 1;
          } else {
            this.col++;
          }
          return next;
        },
        peek:  function ()  {
          return this.arr[this.pos];
        }
      }
    }
  };
})();
