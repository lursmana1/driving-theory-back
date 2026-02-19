import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Headers,
  Query,
} from '@nestjs/common';
import { ExamsService } from './exams.service';
import { CreateExamDto } from './dto/create-exam.dto';
import { UpdateExamDto } from './dto/update-exam.dto';

const VALID_LANGS = new Set(['ka', 'en', 'ru']);
function parseLang(queryLang?: string, headerLang?: string): string {
  if (queryLang && VALID_LANGS.has(queryLang.toLowerCase())) {
    return queryLang.toLowerCase();
  }
  const fromHeader = headerLang?.trim().slice(0, 2).toLowerCase();
  return fromHeader && VALID_LANGS.has(fromHeader) ? fromHeader : 'ka';
}

@Controller('exams')
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  @Post()
  create(@Body() createExamDto: CreateExamDto) {
    return this.examsService.create(createExamDto);
  }

  @Get()
  findAll() {
    return this.examsService.findAll();
  }

  @Get('generate')
  generate(
    @Query('lang') langQuery?: string,
    @Headers('accept-language') langHeader?: string,
    @Query('title') title?: string,
    @Query('subjects') subjects?: string,
    @Query('categories') categories?: string,
    @Query('count') count?: string,
    @Query('allSubjects') allSubjects?: string,
  ) {
    const parsedCategories = categories
      ? categories.split(',').map(Number)
      : undefined;

    const parsedSubjects = subjects
      ? subjects.split(',').map(Number)
      : undefined;

    return this.examsService.generateExam({
      lang: parseLang(langQuery, langHeader),
      title,
      subjects: parsedSubjects,
      categories: parsedCategories,
      count: count ? parseInt(count, 10) : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.examsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateExamDto: UpdateExamDto) {
    return this.examsService.update(id, updateExamDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.examsService.remove(id);
  }
}
