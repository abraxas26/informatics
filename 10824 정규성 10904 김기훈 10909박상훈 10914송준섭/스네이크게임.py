import pygame
import random

# 게임 설정
WINDOW_WIDTH = 600
WINDOW_HEIGHT = 600
CELL_SIZE = 20
FPS = 10

# 색상
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)

# 이미지 불러오기
# (이 자리에 이미지를 저장한 파일 이름을 적어줘)
# head_default.png - 기본 머리 이미지
# head_eat.png - 먹을 때 머리 이미지
# head_hit.png - 부딪혔을 때 머리 이미지
# body.png - 몸통 이미지
# tail.png - 꼬리 이미지
# food.png - 먹이 이미지

pygame.init()
window = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
clock = pygame.time.Clock()

# 이미지 로딩
head_img_default = pygame.image.load("head_default.png")
head_img_eat = pygame.image.load("head_eat.png")
head_img_hit = pygame.image.load("head_hit.png")
body_img = pygame.image.load("body.png")
tail_img = pygame.image.load("tail.png")
food_img = pygame.image.load("food.png")

# 크기 조정
def scale(img):
    return pygame.transform.scale(img, (CELL_SIZE, CELL_SIZE))

head_img_default = scale(head_img_default)
head_img_eat = scale(head_img_eat)
head_img_hit = scale(head_img_hit)
body_img = scale(body_img)
tail_img = scale(tail_img)
food_img = scale(food_img)

# 방향
UP = (0, -1)
DOWN = (0, 1)
LEFT = (-1, 0)
RIGHT = (1, 0)

class Snake:
    def __init__(self):
        self.body = [(5, 5), (4, 5), (3, 5)]  # 머리부터 꼬리 순
        self.direction = RIGHT
        self.grow = False
        self.status = "default"  # default, eat, hit

    def move(self):
        head_x, head_y = self.body[0]
        dir_x, dir_y = self.direction
        new_head = (head_x + dir_x, head_y + dir_y)

        if new_head in self.body or not (0 <= new_head[0] < WINDOW_WIDTH // CELL_SIZE) or not (0 <= new_head[1] < WINDOW_HEIGHT // CELL_SIZE):
            self.status = "hit"
            return False  # 게임 오버

        self.body.insert(0, new_head)
        if self.grow:
            self.grow = False
        else:
            self.body.pop()

        self.status = "default"
        return True

    def eat(self):
        self.grow = True
        self.status = "eat"

    def draw(self, surface):
        for i, segment in enumerate(self.body):
            x, y = segment[0] * CELL_SIZE, segment[1] * CELL_SIZE
            if i == 0:
                if self.status == "default":
                    surface.blit(head_img_default, (x, y))
                elif self.status == "eat":
                    surface.blit(head_img_eat, (x, y))
                elif self.status == "hit":
                    surface.blit(head_img_hit, (x, y))
            elif i == len(self.body) - 1:
                surface.blit(tail_img, (x, y))
            else:
                surface.blit(body_img, (x, y))

class Food:
    def __init__(self):
        self.position = self.random_position()

    def random_position(self):
        return (random.randint(0, (WINDOW_WIDTH // CELL_SIZE) - 1), random.randint(0, (WINDOW_HEIGHT // CELL_SIZE) - 1))

    def draw(self, surface):
        x, y = self.position[0] * CELL_SIZE, self.position[1] * CELL_SIZE
        surface.blit(food_img, (x, y))

snake = Snake()
food = Food()
running = True

while running:
    clock.tick(FPS)
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_UP and snake.direction != DOWN:
                snake.direction = UP
            elif event.key == pygame.K_DOWN and snake.direction != UP:
                snake.direction = DOWN
            elif event.key == pygame.K_LEFT and snake.direction != RIGHT:
                snake.direction = LEFT
            elif event.key == pygame.K_RIGHT and snake.direction != LEFT:
                snake.direction = RIGHT

    if snake.body[0] == food.position:
        snake.eat()
        food = Food()

    if not snake.move():
        break  # 게임 종료

    window.fill(BLACK)
    snake.draw(window)
    food.draw(window)
    pygame.display.update()

font = pygame.font.SysFont(None, 72)
text = font.render("GAME OVER", True, (255, 0, 0))
text_rect = text.get_rect(center=(screen.get_width() // 2, screen.get_height() // 2))
screen.blit(text, text_rect)
pygame.display.flip()
