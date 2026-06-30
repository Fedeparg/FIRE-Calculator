// Los decoradores de NestJS (@Injectable/@Inject) escriben metadata vía
// reflect-metadata al definirse las clases; debe estar cargada antes de importar
// cualquier servicio en los tests.
import 'reflect-metadata';
