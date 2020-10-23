import { join } from 'path';
import { createReadStream } from 'fs';

import * as nock from 'nock';
import * as faker from 'faker';
import { Observable } from 'rxjs';
import { Got, RequestError } from 'got';
import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { getMethods } from '../src/utils';
import { AppModule } from '../src/app.module';
import { AppService } from '../src/app.service';
import { GOT_INSTANCE } from '../../lib/got.constant';
import { StreamRequest } from '../../lib/stream.request';
import { PaginateService } from '../src/paginate.service';
import { StreamTestService } from '../src/stream.service';

describe('GotModule', () => {
    let module: TestingModule, gotInstance: Got;

    describe('test synchronous module registration', () => {
        describe('register()', () => {
            beforeEach(async () => {
                module = await Test.createTestingModule({
                    imports: [AppModule.withRegister()],
                }).compile();
            });

            it('should register got module', async () => {
                gotInstance = module.get<Got>(GOT_INSTANCE);
                expect(AppModule.isGotInstance(gotInstance)).toBeTruthy();
            });
        });
    });

    describe('test asynchronous module registration', () => {
        describe('useFactory()', () => {
            beforeEach(async () => {
                module = await Test.createTestingModule({
                    imports: [AppModule.withUseFactoryRegisterAsync()],
                }).compile();
            });

            it('should register got module', async () => {
                gotInstance = module.get(GOT_INSTANCE);
                expect(AppModule.isGotInstance(gotInstance)).toBeTruthy();
            });
        });

        describe('useClass', () => {
            beforeEach(async () => {
                module = await Test.createTestingModule({
                    imports: [AppModule.withUseClassRegisterAsync()],
                }).compile();
            });

            it('should register got module', async () => {
                gotInstance = module.get(GOT_INSTANCE);
                expect(AppModule.isGotInstance(gotInstance)).toBeTruthy();
            });
        });

        describe('useExisting', () => {
            beforeEach(async () => {
                module = await Test.createTestingModule({
                    imports: [AppModule.withUseExistingRegisterAsync()],
                }).compile();
            });

            it('should register got module using existing', async () => {
                gotInstance = module.get(GOT_INSTANCE);
                expect(AppModule.isGotInstance(gotInstance)).toBeTruthy();
            });
        });

        describe('test features', () => {
            describe('GotService', () => {
                let appService: AppService;

                beforeEach(async () => {
                    module = await Test.createTestingModule({
                        imports: [AppModule.withRegister()],
                        providers: [AppService],
                        exports: [AppService],
                    }).compile();

                    appService = module.get<AppService>(AppService);
                });

                const appMethods = getMethods<AppService>(AppService);

                appMethods.forEach((key, index) => {
                    it(`${key}()`, complete => {
                        const url = faker.internet.url();
                        const route = faker.internet.domainWord();
                        const res = { random: 'random' };

                        nock(url)[key](`/${route}`).reply(HttpStatus.OK, res, {
                            'Content-Type': 'application/json',
                        });

                        const got = appService[key](`${url}/${route}`);

                        got.subscribe({
                            next(response) {
                                expect(response).toEqual(
                                    expect.objectContaining({ body: res }),
                                );
                            },
                            complete,
                        });
                    });

                    if (appMethods.length - 2 === index) {
                        it('should check error reporting', complete => {
                            const url = faker.internet.url();
                            const route = faker.internet.domainWord();
                            const res = {
                                message: 'Invalid params',
                                get response() {
                                    return this.message;
                                },
                                code: HttpStatus.BAD_REQUEST,
                            };

                            nock(url)[key](`/${route}`).replyWithError(res);

                            appService[key](`${url}/${route}`).subscribe({
                                error(error) {
                                    expect(error).toBeInstanceOf(RequestError);
                                    expect(error.code).toEqual(res.code);
                                    complete();
                                },
                            });
                        });
                    }
                });
            });

            describe('PaginationService', () => {
                let paginateService: PaginateService;

                beforeEach(async () => {
                    module = await Test.createTestingModule({
                        imports: [AppModule.withRegister()],
                        providers: [PaginateService],
                        exports: [PaginateService],
                    }).compile();

                    paginateService = module.get<PaginateService>(
                        PaginateService,
                    );
                });

                const paginateMethod = getMethods<PaginateService>(
                    PaginateService,
                );

                paginateMethod.forEach(key => {
                    it(`${key}()`, async () => {
                        const url = faker.internet.url();
                        const route = faker.internet.domainWord();
                        const object = {
                            name: `${faker.name.firstName()} ${faker.name.lastName()}`,
                        };
                        const response = [object];

                        nock(url)
                            .get(`/${route}`)
                            .reply(HttpStatus.OK, response, {
                                'Content-Type': 'application/json',
                            });

                        if (key === 'all') {
                            paginateService.all(`${url}/${route}`).subscribe({
                                next(res) {
                                    expect(res).toEqual(
                                        expect.arrayContaining(response),
                                    );
                                },
                            });
                        } else {
                            paginateService.each(`${url}/${route}`).subscribe({
                                next(response) {
                                    expect(response).toEqual(
                                        expect.objectContaining(object),
                                    );
                                },
                            });
                        }
                    });
                });
            });

            describe('StreamService', () => {
                let streamTestService: StreamTestService;

                beforeEach(async () => {
                    module = await Test.createTestingModule({
                        imports: [AppModule.withRegister()],
                        providers: [StreamTestService],
                        exports: [StreamTestService],
                    }).compile();

                    streamTestService = module.get<StreamTestService>(
                        StreamTestService,
                    );
                });

                ['get', 'head', 'delete', 'post', 'put', 'patch'].forEach(
                    key => {
                        it(`${key}()`, complete => {
                            const uri = faker.internet.url();

                            nock(uri)
                                [key]('/')
                                .reply(HttpStatus.OK, () =>
                                    createReadStream(
                                        join(
                                            process.cwd(),
                                            'tests',
                                            'src',
                                            'utils',
                                            'test.txt',
                                        ),
                                    ),
                                );

                            const streamService = streamTestService[key](
                                uri,
                            ) as StreamRequest;

                            streamService.on<Buffer>('data').subscribe({
                                next(response: Buffer) {
                                    let start = 0;

                                    response
                                        .toString()
                                        .split(/\r?\n/)
                                        .map<{ id: number }>(e => JSON.parse(e))
                                        .forEach(e =>
                                            expect(e.id).toEqual(++start),
                                        );
                                },
                                complete,
                            });

                            streamService.on('end').subscribe(complete);
                        });
                    },
                );
            });
        });
    });
});
