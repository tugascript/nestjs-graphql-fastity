/*
 Free and Open Source - GNU GPLv3

 This file is part of nestjs-graphql-fastify-template

 nestjs-graphql-fastify-template is distributed in the
 hope that it will be useful, but WITHOUT ANY WARRANTY;
 without even the implied warranty of MERCHANTABILITY
 or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 General Public License for more details.

 Copyright © 2023
 Afonso Barracha
*/

import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/postgresql';
import {
  BadRequestException,
  CACHE_MANAGER,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  LoggerService,
  UnauthorizedException,
} from '@nestjs/common';
import { compare, hash } from 'bcrypt';
import { Cache } from 'cache-manager';
import { ISessionsData } from '../auth/interfaces/session-data.interface';
import { CommonService } from '../common/common.service';
import { SearchDto } from '../common/dtos/search.dto';
import { CursorTypeEnum } from '../common/enums/cursor-type.enum';
import { QueryOrderEnum } from '../common/enums/query-order.enum';
import { RatioEnum } from '../common/enums/ratio.enum';
import { IPaginated } from '../common/interfaces/paginated.interface';
import { isNull, isUndefined } from '../config/utils/validation.util';
import { PictureDto } from '../uploader/dtos/picture.dto';
import { UploaderService } from '../uploader/uploader.service';
import { UpdateEmailDto } from './dtos/update-email.dto';
import { UserEntity } from './entities/user.entity';
import { OnlineStatusEnum } from './enums/online-status.enum';
import { IUser } from './interfaces/user.interface';
import { OAuthProvidersEnum } from '../oauth2/enums/oauth-providers.enum';

@Injectable()
export class UsersService {
  private readonly queryName = 'u';
  private readonly loggerService: LoggerService;

  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: EntityRepository<UserEntity>,
    private readonly uploaderService: UploaderService,
    private readonly commonService: CommonService,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {
    this.loggerService = new Logger(UsersService.name);
  }

  public async create(
    email: string,
    name: string,
    provider: OAuthProvidersEnum,
    password?: string,
  ): Promise<UserEntity> {
    const formattedEmail = email.toLowerCase();
    await this.checkEmailUniqueness(formattedEmail);
    const formattedName = this.commonService.formatTitle(name);
    const user = this.usersRepository.create({
      email: formattedEmail,
      name: formattedName,
      username: await this.generateUsername(formattedName),
      authProviders: [provider],
      password: isUndefined(password) ? 'UNSET' : await hash(password, 10),
    });
    await this.commonService.saveEntity(this.usersRepository, user, true);
    return user;
  }

  public async findOneById(id: number): Promise<UserEntity> {
    const user = await this.usersRepository.findOne({ id });
    this.commonService.checkEntityExistence(user, 'User');
    return user;
  }

  public async findOneByUsername(
    username: string,
    forAuth = false,
  ): Promise<UserEntity> {
    const user = await this.usersRepository.findOne({
      username: username.toLowerCase(),
    });

    if (forAuth) {
      this.throwUnauthorizedException(user);
    } else {
      this.commonService.checkEntityExistence(user, 'User');
    }

    return user;
  }

  public async findOneByEmail(email: string): Promise<UserEntity> {
    const user = await this.usersRepository.findOne({
      email: email.toLowerCase(),
    });
    this.throwUnauthorizedException(user);
    return user;
  }

  // necessary for password reset
  public async uncheckedUserByEmail(email: string): Promise<UserEntity> {
    return this.usersRepository.findOne({
      email: email.toLowerCase(),
    });
  }

  public async findOneByCredentials(
    id: number,
    version: number,
  ): Promise<UserEntity> {
    const user = await this.usersRepository.findOne({ id });
    this.throwUnauthorizedException(user);

    if (user.credentials.version !== version) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  public async confirmEmail(
    userId: number,
    version: number,
  ): Promise<UserEntity> {
    const user = await this.findOneByCredentials(userId, version);

    if (user.confirmed) {
      throw new BadRequestException('Email already confirmed');
    }

    user.confirmed = true;
    user.credentials.updateVersion();
    await this.commonService.saveEntity(this.usersRepository, user);
    return user;
  }

  public async updatePassword(
    userId: number,
    password: string,
    newPassword: string,
  ): Promise<UserEntity> {
    const user = await this.findOneById(userId);

    if (!(await compare(password, user.password))) {
      throw new BadRequestException('Wrong password');
    }
    if (await compare(newPassword, user.password)) {
      throw new BadRequestException('New password must be different');
    }

    user.credentials.updatePassword(user.password);
    user.password = await hash(newPassword, 10);
    await this.commonService.saveEntity(this.usersRepository, user);
    return user;
  }

  public async resetPassword(
    userId: number,
    version: number,
    password: string,
  ): Promise<UserEntity> {
    const user = await this.findOneByCredentials(userId, version);
    user.credentials.updatePassword(user.password);
    user.password = await hash(password, 10);
    await this.commonService.saveEntity(this.usersRepository, user);
    return user;
  }

  public async updateEmail(
    userId: number,
    updateEmailDto: UpdateEmailDto,
  ): Promise<UserEntity> {
    const user = await this.findOneById(userId);
    const { email, password } = updateEmailDto;

    if (!(await compare(password, user.password))) {
      throw new BadRequestException('Wrong password');
    }

    const formattedEmail = email.toLowerCase();

    if (user.email === formattedEmail) {
      throw new BadRequestException('Email should be different');
    }

    await this.checkEmailUniqueness(formattedEmail);
    user.email = formattedEmail;
    await this.commonService.saveEntity(this.usersRepository, user);
    return user;
  }

  public async delete(userId: number, password: string): Promise<UserEntity> {
    const user = await this.findOneById(userId);

    if (!(await compare(password, user.password))) {
      throw new BadRequestException('Wrong password');
    }

    await this.commonService.removeEntity(this.usersRepository, user);
    return user;
  }

  public async updateInternal(
    user: UserEntity,
    data: Partial<IUser>,
  ): Promise<void> {
    Object.entries(data).forEach(([key, value]) => {
      if (isUndefined(value)) {
        return;
      }
      user[key] = value;
    });
    await this.commonService.saveEntity(this.usersRepository, user);
  }

  public async updatePicture(
    userId: number,
    updateDto: PictureDto,
  ): Promise<UserEntity> {
    const user = await this.findOneById(userId);
    const oldPicture = user.picture;
    const { picture } = updateDto;
    user.picture = await this.uploaderService.uploadImage(
      userId,
      picture,
      RatioEnum.SQUARE,
    );

    if (!isUndefined(oldPicture) && !isNull(oldPicture)) {
      this.uploaderService
        .deleteFile(oldPicture)
        .then(() => {
          this.loggerService.log(`Deleted old picture: ${oldPicture}`);
        })
        .catch(() => {
          this.loggerService.error(`Error deleting old picture: ${oldPicture}`);
        });
    }

    await this.commonService.saveEntity(this.usersRepository, user);
    return user;
  }

  public async updateName(userId: number, name: string): Promise<UserEntity> {
    const formatName = this.commonService.formatTitle(name);
    const user = await this.findOneById(userId);
    user.name = formatName;
    user.username = await this.generateUsername(formatName);
    await this.commonService.saveEntity(this.usersRepository, user);
    return user;
  }

  public async updateUsername(
    userId: number,
    username: string,
  ): Promise<UserEntity> {
    const user = await this.findOneById(userId);
    const formattedUsername = username.toLowerCase();
    await this.checkUsernameUniqueness(formattedUsername);
    user.username = formattedUsername;
    await this.commonService.saveEntity(this.usersRepository, user);
    return user;
  }

  public async updateOnlineStatus(
    userId: number,
    onlineStatus: OnlineStatusEnum,
  ): Promise<UserEntity> {
    const user = await this.findOneById(userId);
    user.defaultStatus = onlineStatus;
    const data = await this.cacheManager.get<ISessionsData>(
      `sessions:${userId}`,
    );

    if (!isUndefined(data) && !isNull(data)) {
      user.onlineStatus = onlineStatus;
    }

    await this.commonService.saveEntity(this.usersRepository, user);
    return user;
  }

  public async query(dto: SearchDto): Promise<IPaginated<IUser>> {
    const { search, first, after } = dto;
    const qb = this.usersRepository.createQueryBuilder(this.queryName).where({
      confirmed: true,
    });

    if (!isUndefined(search) && !isNull(search)) {
      qb.andWhere({
        name: {
          $ilike: this.commonService.formatSearch(search),
        },
      });
    }

    return this.commonService.queryBuilderPagination(
      this.queryName,
      'username',
      CursorTypeEnum.STRING,
      first,
      QueryOrderEnum.ASC,
      qb,
      after,
    );
  }

  private async checkUsernameUniqueness(username: string): Promise<void> {
    const count = await this.usersRepository.count({ username });

    if (count > 0) {
      throw new ConflictException('Username already in use');
    }
  }

  private throwUnauthorizedException(
    user: undefined | null | UserEntity,
  ): void {
    if (isUndefined(user) || isNull(user)) {
      throw new UnauthorizedException('Invalid credentials');
    }
  }

  private async checkEmailUniqueness(email: string): Promise<void> {
    const count = await this.usersRepository.count({ email });

    if (count > 0) {
      throw new ConflictException('Email already in use');
    }
  }

  /**
   * Generates a unique username using a point slug based on the name
   * and if it's already in use, it adds the usernames count to the end
   */
  private async generateUsername(name: string): Promise<string> {
    const pointSlug = this.commonService.generatePointSlug(name);
    const count = await this.usersRepository.count({
      username: {
        $like: `${pointSlug}%`,
      },
    });

    if (count > 0) {
      return `${pointSlug}${count}`;
    }

    return pointSlug;
  }
}
