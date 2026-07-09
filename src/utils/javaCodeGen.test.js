import { describe, it, expect } from 'vitest';
import { generateJavaCode } from './javaCodeGen.js';

// Animal (abstract) <- Dog, plus a multi-valued attribute and a reference relation.
const metaModel = {
  kind: 'metamodel',
  name: 'Pets',
  classes: [
    {
      id: 'Animal', name: 'Animal', isAbstract: true,
      attributes: [
        { id: 'a1', name: 'name', type: 'STRING',  visibility: 'PUBLIC', lowerBound: 1, upperBound: 1 },
        { id: 'a2', name: 'age',  type: 'INT',      visibility: 'PUBLIC', lowerBound: 0, upperBound: 1, defaultValue: '0' },
      ],
    },
    {
      id: 'Dog', name: 'Dog', isAbstract: false,
      attributes: [
        { id: 'a3', name: 'tricks', type: 'STRING', visibility: 'PUBLIC', lowerBound: 0, upperBound: -1 },
      ],
    },
  ],
  relations: [
    { id: 'r1', kind: 'INHERITANCE', source: 'Dog', target: 'Animal', name: '' },
  ],
};

function fileFor(files, name) {
  return files.find((f) => f.path.endsWith(`/${name}`))?.content ?? '';
}

describe('generateJavaCode', () => {
  const files = generateJavaCode(metaModel, []);

  it('emits one .java file per class', () => {
    expect(fileFor(files, 'Animal.java')).not.toBe('');
    expect(fileFor(files, 'Dog.java')).not.toBe('');
  });

  it('derives the package name from the meta-model name', () => {
    expect(fileFor(files, 'Animal.java')).toContain('package iml.pets;');
  });

  it('marks an abstract class as abstract', () => {
    expect(fileFor(files, 'Animal.java')).toContain('public abstract class Animal');
  });

  it('renders inheritance with extends and a super() call', () => {
    const dog = fileFor(files, 'Dog.java');
    expect(dog).toContain('public class Dog extends Animal');
    expect(dog).toContain('super(');
  });

  it('maps IML primitive types to Java types', () => {
    const animal = fileFor(files, 'Animal.java');
    expect(animal).toContain('private String name');
    expect(animal).toContain('private int age');
  });

  it('applies a meta-model default value to the field initializer', () => {
    expect(fileFor(files, 'Animal.java')).toContain('private int age = 0;');
  });

  it('renders a multi-valued attribute as an ArrayList with the boxed type', () => {
    const dog = fileFor(files, 'Dog.java');
    expect(dog).toContain('import java.util.ArrayList;');
    expect(dog).toContain('ArrayList<String> tricks');
    expect(dog).toContain('public void addTricks(String value)');
  });

  it('generates getters and setters for own attributes', () => {
    const animal = fileFor(files, 'Animal.java');
    expect(animal).toContain('public String getName()');
    expect(animal).toContain('public void setName(String name)');
  });
});
