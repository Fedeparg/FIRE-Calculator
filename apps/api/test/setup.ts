// NestJS decorators (@Injectable/@Inject) write metadata through reflect-metadata
// when the classes are defined; it must be loaded before importing any service in
// the tests.
import 'reflect-metadata';
