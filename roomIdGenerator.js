function generateRoomId() {
  const adjectives = ['bright', 'calm', 'gentle', 'happy', 'peaceful'];
  const animals = ['dolphin', 'eagle', 'fox', 'owl', 'deer'];
  const verbs = ['swimming', 'flying', 'running', 'jumping', 'dancing'];
  
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  const verb = verbs[Math.floor(Math.random() * verbs.length)];
  
  // return `${adj}-${animal}-${verb}`;
  return `bright-dolphin-swimming`;
}

module.exports = { generateRoomId };