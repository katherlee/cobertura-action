const fs = require("fs").promises;
const xml2js = require("xml2js");
const util = require("util");
const glob = require("glob-promise");
const parseString = util.promisify(xml2js.parseString);

async function processCoverage(path, options) {
  options = options || { skipCovered: false };

  if (glob.hasMagic(path)) {
    const paths = await glob(path);
    path = paths[0];
  }

  const xml = await fs.readFile(path, "utf-8");
  const { coverage } = await parseString(xml, {
    explicitArray: false,
    mergeAttrs: true
  });
  const { packages } = coverage;
  const classes = processPackages(packages);
  const files = classes
    .filter(Boolean)
    .map(klass => {
      return {
        ...calculateRates(klass),
        filename: klass["filename"],
        name: klass["name"],
        missing: generateUnhitLines(processLines(klass))
      };
    })
    .filter(file => options.skipCovered === false || file.total < 100);
  return {
    ...calculateRates(coverage),
    files
  };
}

function processPackages(packages) {
  if (packages.package instanceof Array) {
    return packages.package.map(p => processPackage(p)).flat();
  } else if (packages.package) {
    return processPackage(packages.package);
  } else {
    return processPackage(packages);
  }
}

function processPackage(packageObj) {
  if (packageObj.classes && packageObj.classes.class instanceof Array) {
    return packageObj.classes.class;
  } else if (packageObj.classes && packageObj.classes.class) {
    return [packageObj.classes.class];
  } else if (packageObj.class && packageObj.class instanceof Array) {
    return packageObj.class;
  } else {
    return [packageObj.class];
  }
}

function processLines(element) {
  if (element.lines.line && element.lines.line instanceof Array) {
    return element.lines.line;
  }
  if (element.lines.line) {
    return [element.lines.line];
  }
  return [];
}

function calculateRates(element) {
  const line = parseFloat(element["line-rate"]) * 100;
  const branch = parseFloat(element["branch-rate"]) * 100;
  const total = line && branch ? (line + branch) / 2 : line;
  return {
    total,
    line,
    branch
  };
}

function generateUnhitLines(lines) {
  const unhit = lines
    .filter(
      line => {
        return parseInt(line["hits"]) == 0;
      })
    .map(
      line => {
        return parseInt(line["number"]);
      });
  return parseMissingLines(unhit);
}

function parseMissingLines(missing) {
  let intervals = [];
  let begin = null;
  let prev = 0;
  missing.forEach(function(item, index, array) {
    if (begin == null) {
      begin = item;
      prev = item;
      return;
    }

    if (item == prev + 1) {
      prev = item;
      return;
    }

    if (begin == prev) {
      intervals.push(begin.toString());
    } else {
      intervals.push(begin.toString() + '-' + prev.toString());
    }
    begin = null;
    prev = item;
  });

  if (begin != null) {
    if (begin == prev) {
      intervals.push(begin.toString());
    } else {
      intervals.push(begin.toString() + '-' + prev.toString());
    }
  }
  return intervals;
}

module.exports = {
  processCoverage
};
