/*
  Free and Open Source - MIT
  Copyright © 2023
  Afonso Barracha
*/

import { ArgsType, Field } from '@nestjs/graphql';
import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { NAME_REGEX } from '../constants/regex';
import { PaginationDto } from './pagination.dto';

@ArgsType()
export abstract class SearchDto extends PaginationDto {
  @Field(() => String, { nullable: true })
  @IsString()
  @Length(1, 100, {
    message: 'Search needs to be between 1 and 100 characters',
  })
  @Matches(NAME_REGEX, {
    message: 'Search can only contain letters, numbers and spaces',
  })
  @IsOptional()
  public search?: string;
}
