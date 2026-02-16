import { Controller, Get, Param, Query } from '@nestjs/common';
import { QuestionsService } from './questions.service';

@Controller('questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  // GET /questions?category=2&subjects=1,2&page=1&size=20
  @Get()
  findPaged(
    @Query('category') category?: string, // singular in URL
    @Query('subjects') subjects?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    const splittedSubject = subjects?.split(',').map(Number).filter(Number.isFinite);
    return this.questionsService.findPaged({
      category: category ? Number(category) : undefined,
      subjects: subjects ? splittedSubject : undefined,
      page: Math.max(Number(page ?? 1), 1),
      size: clampSize(size),
    });
  }

  // GET /questions/random?category=2&subjects=1,2&count=30
  @Get('random')
  findRandom(
    @Query('count') count?: string,
    @Query('category') category?: string,
    @Query('subjects') subjects?: string,
  ) {
    return this.questionsService.findRandom({
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
