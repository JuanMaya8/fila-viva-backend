import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TurnsService } from './turns.service';
import { CreateTurnDto } from './dto/create-turn.dto';

@ApiTags('turns')
@Controller('turns')
export class TurnsController {
  constructor(private readonly turnsService: TurnsService) {}

  @Post()
  create(@Body() dto: CreateTurnDto) {
    return this.turnsService.create(dto);
  }

  @Get()
  findQueue(@Query('serviceTypeId') serviceTypeId: string) {
    return this.turnsService.findQueue(serviceTypeId);
  }

  @Patch(':id/complete')
  complete(@Param('id') id: string) {
    return this.turnsService.markCompleted(id);
  }
}
