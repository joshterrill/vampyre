const people = [
  { name: 'Alice', age: 30 },
  { name: 'Bob', age: 25 },
  { name: 'Charlie', age: 35 }
];

const names = people.map(person => person.name);

console.log('Names:');
console.log(names);

function addToAge(person, years) {
  return { ...person, age: person.age + years };
}

for (const person of people) {
  const olderPerson = addToAge(person, 5);
  console.log(`${person.name} will be ${olderPerson.age} in 5 years.`);
}
