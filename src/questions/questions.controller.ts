import { Controller, Get, Param, Query } from '@nestjs/common';
import { QuestionsService } from './questions.service';

@Controller('questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Get()
  findAll(
    @Query('random') random?: string,
    @Query('limit') limit?: string,
    @Query('categories') categories?: string,
    @Query('subjects') subjects?: string,
  ) {
    return this.questionsService.findAll({
      categories: categories ? categories.split(',').map(Number) : undefined,
      subjects: subjects ? subjects.split(',').map(Number) : undefined,
      random: random ? parseInt(random, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('random')
  findRandom(@Query('count') count?: string) {
    return this.questionsService.findRandom(count ? parseInt(count, 10) : 10);
  }

  @Get('subject/:subject')
  findBySubject(@Param('subject') subject: string) {
    return this.questionsService.findBySubject(parseInt(subject, 10));
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.questionsService.findOne(id);
  }
}
