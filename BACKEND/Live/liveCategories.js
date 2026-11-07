const collegeAliases = {
  Engineering: [
    [/lpu|lovely professional/i, "LPU"],
    [/kiit|kalinga institute/i, "KIIT"],
    [/\biit\b|indian institute of technology/i, "IIT"],
    [/\bnit\b|national institute of technology/i, "NIT"],
  ],
  Medical: [
    [/aiims|all india institute/i, "AIIMS"],
    [/jipmer/i, "JIPMER"],
    [/\bkgmu\b|king george/i, "KGMU"],
    [/cmc|vellore/i, "CMC Vellore"],
  ],
  FashionDesign: [
    [/\bnift\b|national institute of fashion/i, "NIFT"],
    [/pearl academy/i, "Pearl Academy"],
    [/\bnid\b|national institute of design/i, "NID"],
  ],
  Arts: [
    [/\bdu\b|delhi university/i, "DU"],
    [/\bjnu\b|jawaharlal nehru/i, "JNU"],
    [/visva bharati/i, "Visva Bharati"],
  ],
};

function getCollegeFilter(category, collegeName) {
  if (category === "Other") return "Other colleges";
  const aliases = collegeAliases[category] || [];
  return aliases.find(([pattern]) => pattern.test(collegeName))?.[1] || "Others";
}

module.exports = { getCollegeFilter };
