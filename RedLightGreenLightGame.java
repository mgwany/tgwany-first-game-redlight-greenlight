import javax.swing.*;
import java.awt.*;
import java.awt.event.*;
import java.util.Random;

public class RedLightGreenLightGame {

    public static void main(String[] args) {
        SwingUtilities.invokeLater(() -> {
            JFrame f = new JFrame("Red Light, Green Light — Learn to Code!");
            f.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
            f.setResizable(false);
            f.setContentPane(new GamePanel());
            f.pack();
            f.setLocationRelativeTo(null);
            f.setVisible(true);
        });
    }

    @SuppressWarnings("serial")
    private static class GamePanel extends JPanel {
        private static final int WIDTH = 800;
        private static final int HEIGHT = 500;
        private static final int PADDING = 20;

        private static final int PLAYER_SIZE = 24;
        private static final int MOVE_STEP = 10;
        private int playerX = PADDING;
        private int playerY = HEIGHT / 2 - PLAYER_SIZE / 2;

        private enum LightState { GREEN, YELLOW, RED }
        private LightState lightState = LightState.GREEN;

        private final Random rand = new Random();

        private boolean gameOver = false;
        private boolean playerWon = false;

        private long startTimeMs;
        private long endTimeMs;

        private Timer lightTimer;
        private Timer repaintTimer;

        // Levels
        private int currentLevel = 1;
        private int yellowDuration = 500; // ms, halves each level

        GamePanel() {
            setPreferredSize(new Dimension(WIDTH, HEIGHT));
            setBackground(new Color(245, 246, 250));

            setupKeyBindings();
            startGame();
        }

        private void startGame() {
            playerX = PADDING;
            playerY = HEIGHT / 2 - PLAYER_SIZE / 2;
            lightState = LightState.GREEN;
            gameOver = false;
            playerWon = false;
            startTimeMs = System.currentTimeMillis();
            endTimeMs = 0L;

            if (lightTimer != null) lightTimer.stop();
            scheduleNextLightSwitch();

            if (repaintTimer != null) repaintTimer.stop();
            repaintTimer = new Timer(16, e -> repaint());
            repaintTimer.start();
        }

        private void scheduleNextLightSwitch() {
            if (lightTimer != null) lightTimer.stop();

            int nextInterval = 1200 + rand.nextInt(1801); // 1.2s–3.0s

            lightTimer = new Timer(nextInterval, e -> {
                if (lightState == LightState.GREEN) {
                    // switch to yellow for current level duration
                    lightState = LightState.YELLOW;
                    Timer yellowTimer = new Timer(yellowDuration, ev -> {
                        lightState = LightState.RED;
                        scheduleNextLightSwitch();
                    });
                    yellowTimer.setRepeats(false);
                    yellowTimer.start();
                } else if (lightState == LightState.RED) {
                    // switch back to green
                    lightState = LightState.GREEN;
                    scheduleNextLightSwitch();
                }
            });
            lightTimer.setRepeats(false);
            lightTimer.start();
        }

        private void endGame(boolean won) {
            gameOver = true;
            playerWon = won;
            endTimeMs = System.currentTimeMillis();
            if (lightTimer != null) lightTimer.stop();

            if (won) {
                // Advance level
                currentLevel++;
                yellowDuration = Math.max(50, yellowDuration / 2); // halve, min 50ms
            }
        }

        private void restartGame() {
            startGame();
        }

        private void setupKeyBindings() {
            int WHEN_FOCUSED = JComponent.WHEN_IN_FOCUSED_WINDOW;

            getInputMap(WHEN_FOCUSED).put(KeyStroke.getKeyStroke("LEFT"), "moveLeft");
            getInputMap(WHEN_FOCUSED).put(KeyStroke.getKeyStroke("RIGHT"), "moveRight");
            getInputMap(WHEN_FOCUSED).put(KeyStroke.getKeyStroke("UP"), "moveUp");
            getInputMap(WHEN_FOCUSED).put(KeyStroke.getKeyStroke("DOWN"), "moveDown");
            getInputMap(WHEN_FOCUSED).put(KeyStroke.getKeyStroke('R'), "restart");

            getActionMap().put("moveLeft",   new MoveAction(-MOVE_STEP, 0));
            getActionMap().put("moveRight",  new MoveAction(MOVE_STEP, 0));
            getActionMap().put("moveUp",     new MoveAction(0, -MOVE_STEP));
            getActionMap().put("moveDown",   new MoveAction(0, MOVE_STEP));
            getActionMap().put("restart", new AbstractAction() {
                @Override public void actionPerformed(ActionEvent e) {
                    if (gameOver) restartGame();
                }
            });
        }

        private class MoveAction extends AbstractAction {
            private final int dx, dy;
            MoveAction(int dx, int dy) { this.dx = dx; this.dy = dy; }

            @Override public void actionPerformed(ActionEvent e) {
                if (gameOver) return;

                // Only lose if moving during RED
                if (lightState == LightState.RED) {
                    endGame(false);
                    repaint();
                    return;
                }

                playerX += dx;
                playerY += dy;
                playerX = clamp(playerX, PADDING, WIDTH - PADDING - PLAYER_SIZE);
                playerY = clamp(playerY, PADDING, HEIGHT - PADDING - PLAYER_SIZE);

                if (playerX >= WIDTH - PADDING - PLAYER_SIZE) {
                    endGame(true);
                }

                repaint();
            }
        }

        private static int clamp(int v, int min, int max) {
            return Math.max(min, Math.min(max, v));
        }

        @Override
        protected void paintComponent(Graphics g) {
            super.paintComponent(g);
            Graphics2D g2 = (Graphics2D) g.create();
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

            drawGrid(g2);
            drawFinishLine(g2);

            g2.setColor(new Color(45, 114, 210));
            g2.fillRoundRect(playerX, playerY, PLAYER_SIZE, PLAYER_SIZE, 8, 8);

            drawTrafficLight(g2);
            drawInstructions(g2);

            if (gameOver) drawGameOver(g2);

            g2.dispose();
        }

        private void drawGrid(Graphics2D g2) {
            g2.setColor(new Color(230, 232, 238));
            for (int x = PADDING; x < WIDTH - PADDING; x += 40)
                g2.drawLine(x, PADDING, x, HEIGHT - PADDING);
            for (int y = PADDING; y < HEIGHT - PADDING; y += 40)
                g2.drawLine(PADDING, y, WIDTH - PADDING, y);
        }

        private void drawFinishLine(Graphics2D g2) {
            int x = WIDTH - PADDING - 6;
            g2.setColor(Color.BLUE);
            g2.fillRect(x, PADDING, 6, HEIGHT - 2 * PADDING);
            g2.setFont(g2.getFont().deriveFont(Font.BOLD, 12f));
            g2.drawString("Finish", x - 45, PADDING + 15);
        }

        private void drawTrafficLight(Graphics2D g2) {
            int lightX = WIDTH - 120;
            int lightY = 20;
            int boxW = 90, boxH = 200;

            g2.setColor(new Color(50, 50, 50));
            g2.fillRoundRect(lightX, lightY, boxW, boxH, 16, 16);

            // Red
            g2.setColor(lightState == LightState.RED ? new Color(220, 50, 47) : new Color(120, 120, 120));
            g2.fillOval(lightX + 20, lightY + 15, 50, 50);

            // Yellow
            g2.setColor(lightState == LightState.YELLOW ? new Color(253, 203, 110) : new Color(120, 120, 120));
            g2.fillOval(lightX + 20, lightY + 75, 50, 50);

            // Green
            g2.setColor(lightState == LightState.GREEN ? new Color(46, 204, 64) : new Color(120, 120, 120));
            g2.fillOval(lightX + 20, lightY + 135, 50, 50);

            g2.setColor(Color.BLACK);
            g2.setFont(g2.getFont().deriveFont(Font.BOLD, 12f));
            String label = switch (lightState) {
                case GREEN -> "GREEN — Go!";
                case YELLOW -> "YELLOW — Hurry!";
                case RED -> "RED — Don't Move!";
            };
            g2.drawString(label, lightX - 5, lightY + boxH + 15);
        }

        private void drawInstructions(Graphics2D g2) {
            g2.setColor(new Color(40, 40, 40));
            g2.setFont(g2.getFont().deriveFont(Font.PLAIN, 14f));

            long now = System.currentTimeMillis();
            long elapsedMs = (gameOver ? endTimeMs : now) - startTimeMs;
            String timeStr = String.format("Time: %.1fs", elapsedMs / 1000.0);

            g2.drawString("Level " + currentLevel + " — Move with Arrow Keys. Don't move on RED. Reach the finish line!", 20, 24);
            g2.drawString(timeStr, 20, 44);
            if (gameOver) g2.drawString("Press 'R' to restart.", 20, 64);
        }

        private void drawGameOver(Graphics2D g2) {
            Composite old = g2.getComposite();
            g2.setComposite(AlphaComposite.SrcOver.derive(0.7f));
            g2.setColor(Color.BLACK);
            g2.fillRect(0, 0, WIDTH, HEIGHT);
            g2.setComposite(old);

            g2.setColor(Color.WHITE);
            g2.setFont(g2.getFont().deriveFont(Font.BOLD, 36f));

            String msg = playerWon ? "🎉 You Win! Level Up!" : "You moved on RED! Game Over";
            FontMetrics fm = g2.getFontMetrics();
            int tx = (WIDTH - fm.stringWidth(msg)) / 2;
            int ty = HEIGHT / 2 - fm.getHeight();
            g2.drawString(msg, tx, ty);

            g2.setFont(g2.getFont().deriveFont(Font.PLAIN, 18f));
            String sub = playerWon ? "Next Level: " + currentLevel + " — Press 'R' to play!" : "Press 'R' to try again.";
            fm = g2.getFontMetrics();
            g2.drawString(sub, (WIDTH - fm.stringWidth(sub)) / 2, ty + 40);
        }
    }
}
