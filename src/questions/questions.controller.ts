import { Controller, Get, Headers, Param, Query } from '@nestjs/common';
import { QuestionsService } from './questions.service';

const VALID_LANGS = new Set(['ka', 'en', 'ru']);
function parseLang(queryLang?: string, headerLang?: string): string {
  if (queryLang && VALID_LANGS.has(queryLang.toLowerCase())) {
    return queryLang.toLowerCase();
  }
  const fromHeader = headerLang?.trim().slice(0, 2).toLowerCase();
  return fromHeader && VALID_LANGS.has(fromHeader) ? fromHeader : 'ka';
}

@Controller('questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Get()
  findPaged(
    @Query('lang') langQuery?: string,
    @Headers('accept-language') langHeader?: string,
    @Query('category') category?: string,
    @Query('subjects') subjects?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    const splittedSubject = subjects?.split(',').map(Number).filter(Number.isFinite);
    return this.questionsService.findPaged({
      lang: parseLang(langQuery, langHeader),
      category: category ? Number(category) : undefined,
      subjects: subjects ? splittedSubject : undefined,
      page: Math.max(Number(page ?? 1), 1),
      size: clampSize(size),
    });
  }

  @Get('random')
  findRandom(
    @Query('lang') langQuery?: string,
    @Headers('accept-language') langHeader?: string,
    @Query('count') count?: string,
    @Query('category') category?: string,
    @Query('subjects') subjects?: string,
  ) {
    return this.questionsService.findRandom({
      lang: parseLang(langQuery, langHeader),
      count: Math.min(Math.max(Number(count ?? 10), 1), 200),
      category: category ? Number(category) : undefined,
      subjects: subjects
        ? subjects.split(',').map(Number).filter(Number.isFinite)
        : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.questionsService.findOne(id);
  }
}

function clampSize(size?: string): 10 | 20 | 40 {
  const n = Number(size ?? 20);
  if (n === 10 || n === 20 || n === 40) return n;
  return 20;
}
