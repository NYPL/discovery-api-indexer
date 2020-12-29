if (ctx._source.subjectLiteral != null) {
  ArrayList values = [];
  for(int i = 0; i < ctx._source.subjectLiteral.length; i ++ ) {
    String subjectLiteral = ctx._source.subjectLiteral[i];
    if (subjectLiteral.substring(subjectLiteral.length() - 1) == '.') {
      subjectLiteral = subjectLiteral.substring(0, subjectLiteral.length() - 1);
    }
    int currentStartIndex = 0;
    int currentFindIndex = subjectLiteral.indexOf(' -- ', currentStartIndex);
    while (currentFindIndex != -1) {
      values.add(subjectLiteral.substring(0, currentFindIndex));
      currentStartIndex = currentFindIndex + 4;
      currentFindIndex = subjectLiteral.indexOf(' -- ', currentStartIndex);
    }
    values.add(subjectLiteral);
  }
  ctx._source.subjectLiteral_exploded = values;
}
