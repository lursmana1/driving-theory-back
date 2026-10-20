import { NotFoundException } from '@nestjs/common';
import { BlogsService } from './blogs.service';
import { INCREMENT_BLOG_VIEWS_SQL } from './blog-views.query';

describe('BlogsService.recordView', () => {
  function setup() {
    const blogsRepo = { query: jest.fn() };
    const service = new BlogsService(blogsRepo as never, {} as never);
    return { service, blogsRepo };
  }

  it('increments atomically and returns the new count as a number', async () => {
    const { service, blogsRepo } = setup();
    blogsRepo.query.mockResolvedValue([{ viewsCount: '8' }]);

    await expect(service.recordView(3)).resolves.toEqual({ viewsCount: 8 });
    expect(blogsRepo.query).toHaveBeenCalledWith(INCREMENT_BLOG_VIEWS_SQL, [3]);
  });

  it('404s when no blog row was updated', async () => {
    const { service, blogsRepo } = setup();
    blogsRepo.query.mockResolvedValue([]);

    await expect(service.recordView(999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
