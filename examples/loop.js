(() => {
  "use strict";


  const K = ((Math.random() * 250) | 0) + 1;


  const B = [
    [72,101,108,108,111],
    [44,32],
    [108,111,103],
    [110,97,109,101]
  ].map(a => a.map(v => v ^ K));

  const D = i => String.fromCharCode(...B[i].map(v => v ^ K));


  const dict = {};
  const keys = [0,1,2,3].sort(() => Math.random() - 0.5);
  for (let i = 0; i < keys.length; i++) {
    dict["k" + i] = D(keys[i]);
  }


  let s = 0;
  let hello, comma, logKey, nameKey;

  while (true) {
    switch (s) {
      case 0:
        hello = dict["k" + keys.indexOf(0)];
        s++;
        break;
      case 1:
        comma = dict["k" + keys.indexOf(1)];
        s++;
        break;
      case 2:
        logKey = dict["k" + keys.indexOf(2)];
        s++;
        break;
      case 3:
        nameKey = dict["k" + keys.indexOf(3)];
        s++;
        break;
      case 4:

        const sayHello = function () {
          const args = arguments;
          console[logKey](hello + comma + args[0]);
        };
        sayHello("Josh");
        return;
    }
  }
})();
