import {
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { parseLang } from '../common/utils/parse-lang.util.js';
import { parseIdList } from '../common/utils/parse-ids.util.js';
import {
  ListQuestionsQueryDto,
  RandomQuestionsQueryDto,
} from './dto/questions-query.dto.js';

const DEFAULT_RANDOM_QUESTIONS = 10;
const MAX_RANDOM_QUESTIONS = 200;

@Controller('questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Get()
  findPaged(
    @Query() query: ListQuestionsQueryDto,
    @Query('lang') langQuery?: string,
    @Headers('accept-language') langHeader?: string,
    @Query('subjects') subjects?: string,
    @Query('size') size?: string,
    @Query('limit') limit?: string,
  ) {
    return this.questionsService.findPaged({
      lang: parseLang(langQuery, langHeader),
      category: query.category,
      subjects: parseIdList(subjects),
      page: Math.max(query.page ?? 1, 1),
      size: clampSize(size ?? limit),
    });
  }

  @Get('random')
  findRandom(
    @Query() query: RandomQuestionsQueryDto,
    @Query('lang') langQuery?: string,
    @Headers('accept-language') langHeader?: string,
    @Query('subjects') subjects?: string,
  ) {
    return this.questionsService.findRandom({
      lang: parseLang(langQuery, langHeader),
      count: Math.min(
        Math.max(query.count ?? DEFAULT_RANDOM_QUESTIONS, 1),
        MAX_RANDOM_QUESTIONS,
      ),
      category: query.category,
      subjects: parseIdList(subjects),
    });
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('lang') langQuery?: string,
    @Headers('accept-language') langHeader?: string,
  ) {
    return this.questionsService.findOne(id, parseLang(langQuery, langHeader));
  }
}

/** The question bank offers three fixed page sizes; anything else snaps to 20. */
function clampSize(size?: string): 10 | 20 | 40 {
  const n = Number(size ?? 20);
  if (n === 10 || n === 20 || n === 40) return n;
  return 20;
}
