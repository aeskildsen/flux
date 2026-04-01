try {
  Quarks.install("https://github.com/musikinformatik/JSONlib.git");
} {
  "Failed to install quark JSONlib".error;
  1.exit;
};

0.exit;