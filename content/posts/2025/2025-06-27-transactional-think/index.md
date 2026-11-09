---
title: JPA Transactional 점검하기
author: keencho
date: 2025-06-27 20:12:00 +0900
categories: [Java]
tags: [Java, JPA]
---

JPA를 다루는 개발자라면 Transactional의 동작 원리를 정확히 이해해야 한다. 하지만 솔직히 말하면, 프로젝트 초기에 세운 가이드라인을 처음에는 잘 지켰지만 개발이 진행되면서 점점 `일단 @Transactional 붙이고 보자`는 식으로 습관적으로 사용했던 적이 많다. 당연히 이런 무분별한 사용은 여러 문제를 야기했고, 이를 계기로 JPA Transactional 사용법을 다시 점검하고 명확한 원칙을 정립해보고자 한다.

## **@Transactional 남용하지 않기**
@Transactional을 남용하면 어떤 일이 일어날 수 있는지 알아보자. 테스트 환경은 다음과 같다.

~~~java
hikari:
  maximum-pool-size: 1
  connection-timeout: 1000
jpa:
  open-in-view: false
  
@GetMapping("/concurrent")
public ResponseEntity<?> concurrentTest() {
    System.out.println("🚀 동시 테스트 시작!");

    var future1 = CompletableFuture.supplyAsync(() -> {
        try {
            System.out.println("🔴 스레드1 시작: " + Thread.currentThread().getName());
            testService.test();
            System.out.println("🟢 스레드1 완료: " + Thread.currentThread().getName());
            return "완료1";
        } catch (Exception e) {
            System.out.println("❌ 스레드1 실패: " + e.getMessage());
            return "실패1: " + e.getMessage();
        }
    });

    var future2 = CompletableFuture.supplyAsync(() -> {
        try {
            System.out.println("🔴 스레드2 시작: " + Thread.currentThread().getName());
            testService.save();
            System.out.println("🟢 스레드2 완료: " + Thread.currentThread().getName());
            return "완료2";
        } catch (Exception e) {
            System.out.println("❌ 스레드2 실패: " + e.getMessage());
            return "실패2: " + e.getMessage();
        }
    });

    return ResponseEntity.ok(
            Map.of(
                    "result1", future1.join(),
                    "result2", future2.join()
            )
    );
}
~~~

- OpenEntityManagerInView가 HTTP 요청당 하나의 EntityManager를 유지하고, 이는 커넥션을 먼저 점유하기에 open-in-view 를 비활성화 한다.
- `CompletableFutre.supplyAsync()`로 2개의 별도 스레드 풀에서 동시에 `bookService.save()`를 호출한다. 

##### **_DB 작업 없는 메소드에 @Transactional_**
```java
@SneakyThrows
@Transactional
public void test() {
    Thread.sleep(2000);

    var a = 3;
    var b = 2;
    var c = a / b;
    System.out.println(c);
}
```
DB 작업이 없다. 그럼에도 @Transactional이 트랜잭션 시작부터 끝까지 커넥션을 홀딩하기에 2개의 호출중 한개는 1초의 커넥션 타임아웃으로 인해 에러가 발생한다. 물론 DB 작업이 없기에 그리 심각하지 않은 문제이긴 할것이다.

```
HikariPool-1 - Connection is not available, request timed out after 1010ms (total=1, active=1, idle=0, waiting=0)
결과:
{
    "result2": "완료2",
    "result1": "실패1: Could not open JPA EntityManager for transaction"
}
```

##### **_내부 DB 작업이 있는 메소드에 @Transactional_**
```java
@SneakyThrows
@Transactional
public void test() {
    
    var order = apiService.order();
    Thread.sleep(2000);
    
    var result = new orderResult();
    result.setSuccess(order.isSuccess());
    result.setMessage(order.getMessage());
    result.setOrderNo(order.getOrderNo());

    orderResultRepository.save(result);
}
```
이번엔 외부 API를 호출하고 결과를 DB에 저장하는 예제이다. 외부 API 호출까진 성공하겠으나, 내부 DB에 결과를 작업하기 위해 대기하는 2초간 에러가 발생할 것이다. DB에는 1개의 결과만 저장된다.
이는 외부 서비스에는 주문 정보가 있고 내부 서비스에는 주문 결과가 없는, 상황에 따라 심각한 문제를 야기할 수 있다.  

또한 외부 API 동작에 의해 트랜잭션 처리가 지연되고 그만큼 내부 서비스 DB 연결시간에 영향을 받기 때문에 매우 중요하게 접근해야할 필요가 있다.

```
HikariPool-1 - Connection is not available, request timed out after 1011ms (total=1, active=1, idle=0, waiting=0)
{
    "result2": "완료2",
    "result1": "실패1: Could not open JPA EntityManager for transaction"
}
```

##### **_단순 조회만 수행하는 메소드에 @Transactional_**
단순 조회만 수행하는 메소드에 @Transactional을 붙였을때 트랜잭션이 어떻게 동작하는지 확인해보자.
```java
@Component
public class TransactionChecker {

    @Autowired
    DataSource dataSource;

    /**
     * 1. 트랜잭션 상태 확인
     */
    public void checkTransactionStatus(String actionName) {
        var isTransactionActive = TransactionSynchronizationManager.isActualTransactionActive();
        var isSynchronizationActive = TransactionSynchronizationManager.isSynchronizationActive();
        var transactionName = TransactionSynchronizationManager.getCurrentTransactionName();

        System.out.printf("🔍 [%s] 트랜잭션 상태:%n", actionName);
        System.out.printf("   ├─ 활성화: %s%n", isTransactionActive ? "✅ YES" : "❌ NO");
        System.out.printf("   ├─ 동기화: %s%n", isSynchronizationActive ? "✅ YES" : "❌ NO");
        System.out.printf("   └─ 이름: %s%n", transactionName != null ? transactionName : "없음");
    }

    /**
     * 2. HikariCP 커넥션 풀 상태 확인
     */
    public void checkConnectionPoolStatus(String actionName) {
        if (dataSource instanceof HikariDataSource hikariDataSource) {
            var poolBean = hikariDataSource.getHikariPoolMXBean();

            System.out.printf("🏊‍♂️ [%s] HikariCP 상태:%n", actionName);
            System.out.printf("   ├─ 활성 커넥션: %d%n", poolBean.getActiveConnections());
            System.out.printf("   ├─ 유휴 커넥션: %d%n", poolBean.getIdleConnections());
            System.out.printf("   ├─ 전체 커넥션: %d%n", poolBean.getTotalConnections());
            System.out.printf("   ├─ 대기 중인 스레드: %d%n", poolBean.getThreadsAwaitingConnection());
            System.out.printf("   └─ 최대 풀 크기: %d%n", hikariDataSource.getMaximumPoolSize());
        } else {
            System.out.printf("🏊‍♂️ [%s] HikariCP가 아님: %s%n", actionName, dataSource.getClass().getSimpleName());
        }
    }

    /**
     * 3. 한 번에 모든 상태 확인
     */
    public void checkAll(String actionName) {
        var threadName = Thread.currentThread().getName();
        System.out.printf("📊 === [%s] %s 상태 체크 ===%n", actionName, threadName);
        this.checkTransactionStatus(actionName);
        this.checkConnectionPoolStatus(actionName);
        System.out.println("📊 ========================================");
    }
}
```
트랜잭션 상태를 확인할 수 있는 헬퍼 클래스다.

**_1. @Transactional 없이 조회_**
```java
public void test() {
    transactionChecker.checkAll("읽기 전");
    var list = authorRepository.findAll();
    transactionChecker.checkAll("읽은 후");
}
```
```
🔴 [13:57:07.976] http-nio-8080-exec-1 - 요청 시작
📊 === [읽기 전] http-nio-8080-exec-1 상태 체크 ===
🔍 [읽기 전] 트랜잭션 상태:
   ├─ 활성화: ❌ NO
   ├─ 동기화: ❌ NO
   └─ 이름: 없음
🏊‍♂️ [읽기 전] HikariCP 상태:
   ├─ 활성 커넥션: 0
   ├─ 유휴 커넥션: 1
   ├─ 전체 커넥션: 1
   ├─ 대기 중인 스레드: 0
   └─ 최대 풀 크기: 1
📊 ========================================
13:57:07.980 DEBUG [http-nio-8080-exec-1] o.s.orm.jpa.JpaTransactionManager - Creating new transaction with name [org.springframework.data.jpa.repository.support.SimpleJpaRepository.findAll]: PROPAGATION_REQUIRED,ISOLATION_DEFAULT,readOnly
13:57:07.980 DEBUG [http-nio-8080-exec-1] o.s.orm.jpa.JpaTransactionManager - Opened new EntityManager [SessionImpl(1191829786<open>)] for JPA transaction
13:57:07.983 DEBUG [http-nio-8080-exec-1] o.s.orm.jpa.JpaTransactionManager - Exposing JPA transaction as JDBC [org.springframework.orm.jpa.vendor.HibernateJpaDialect$HibernateConnectionHandle@42c003ac]
13:57:08.054 DEBUG [http-nio-8080-exec-1] o.s.orm.jpa.JpaTransactionManager - Initiating transaction commit
13:57:08.054 DEBUG [http-nio-8080-exec-1] o.s.orm.jpa.JpaTransactionManager - Committing JPA transaction on EntityManager [SessionImpl(1191829786<open>)]
13:57:08.055 DEBUG [http-nio-8080-exec-1] o.s.orm.jpa.JpaTransactionManager - Closing JPA EntityManager [SessionImpl(1191829786<open>)] after transaction
📊 === [읽은 후] http-nio-8080-exec-1 상태 체크 ===
🔍 [읽은 후] 트랜잭션 상태:
   ├─ 활성화: ❌ NO
   ├─ 동기화: ❌ NO
   └─ 이름: 없음
🏊‍♂️ [읽은 후] HikariCP 상태:
   ├─ 활성 커넥션: 0
   ├─ 유휴 커넥션: 1
   ├─ 전체 커넥션: 1
   ├─ 대기 중인 스레드: 0
   └─ 최대 풀 크기: 1
📊 ========================================
🟢 [13:57:08.056] http-nio-8080-exec-1 - 요청 완료 (소요: 80ms)
```
결과는 위와 같다. `authorRepository.findAll()` 를 수행할때 트랜잭션이 생성되고 바로 트랜잭션이 커밋된다. 다시말해, 이때 hikari pool에서 커넥션을 획득하고 바로 반납한다는 의미가 된다.

**_2. @Transactional 붙이고 조회_**
```java
@Transactional
public void test() {
    transactionChecker.checkAll("읽기 전");
    var list = authorRepository.findAll();
    transactionChecker.checkAll("읽은 후");
}
```
```
🔴 [13:59:19.626] http-nio-8080-exec-3 - 요청 시작
13:59:19.628 DEBUG [http-nio-8080-exec-3] o.s.orm.jpa.JpaTransactionManager - Creating new transaction with name [com.keencho.spring.service.TestService.test]: PROPAGATION_REQUIRED,ISOLATION_DEFAULT
13:59:19.628 DEBUG [http-nio-8080-exec-3] o.s.orm.jpa.JpaTransactionManager - Opened new EntityManager [SessionImpl(2125691159<open>)] for JPA transaction
13:59:19.631 DEBUG [http-nio-8080-exec-3] o.s.orm.jpa.JpaTransactionManager - Exposing JPA transaction as JDBC [org.springframework.orm.jpa.vendor.HibernateJpaDialect$HibernateConnectionHandle@27049398]
📊 === [읽기 전] http-nio-8080-exec-3 상태 체크 ===
🔍 [읽기 전] 트랜잭션 상태:
   ├─ 활성화: ✅ YES
   ├─ 동기화: ✅ YES
   └─ 이름: com.keencho.spring.service.TestService.test
🏊‍♂️ [읽기 전] HikariCP 상태:
   ├─ 활성 커넥션: 1
   ├─ 유휴 커넥션: 0
   ├─ 전체 커넥션: 1
   ├─ 대기 중인 스레드: 0
   └─ 최대 풀 크기: 1
📊 ========================================
13:59:19.634 DEBUG [http-nio-8080-exec-3] o.s.orm.jpa.JpaTransactionManager - Found thread-bound EntityManager [SessionImpl(2125691159<open>)] for JPA transaction
13:59:19.634 DEBUG [http-nio-8080-exec-3] o.s.orm.jpa.JpaTransactionManager - Participating in existing transaction
📊 === [읽은 후] http-nio-8080-exec-3 상태 체크 ===
🔍 [읽은 후] 트랜잭션 상태:
   ├─ 활성화: ✅ YES
   ├─ 동기화: ✅ YES
   └─ 이름: com.keencho.spring.service.TestService.test
🏊‍♂️ [읽은 후] HikariCP 상태:
   ├─ 활성 커넥션: 1
   ├─ 유휴 커넥션: 0
   ├─ 전체 커넥션: 1
   ├─ 대기 중인 스레드: 0
   └─ 최대 풀 크기: 1
📊 ========================================
13:59:19.703 DEBUG [http-nio-8080-exec-3] o.s.orm.jpa.JpaTransactionManager - Initiating transaction commit
13:59:19.704 DEBUG [http-nio-8080-exec-3] o.s.orm.jpa.JpaTransactionManager - Committing JPA transaction on EntityManager [SessionImpl(2125691159<open>)]
13:59:19.705 DEBUG [http-nio-8080-exec-3] o.s.orm.jpa.JpaTransactionManager - Closing JPA EntityManager [SessionImpl(2125691159<open>)] after transaction
🟢 [13:59:19.705] http-nio-8080-exec-3 - 요청 완료 (소요: 79ms)
```
결과는 위와 같다. http 요청이 들어오고 `testService.test()` 메소드를 탔을때 트랜잭션이 생성된다. 그 후 `authRepository.findAll()` 수행시 기존 트랜잭션에 참여하고 메소드가 종료될때 트랜잭션을 커밋하고 종료한다.

정리하면 다음과 같다.
```
@Transactional 있음:
메소드 시작 → [커넥션 획득] → DB작업1 → DB작업2 → [커넥션 반납] ← 메소드 끝
            └───────── 쭉 홀딩 ────────────┘

@Transactional 없음:
메서드 시작 → [획득→반납] → [획득→반납] → 메서드 끝
              DB작업1      DB작업2

성능 영향:
- @Transactional: 커넥션 홀딩 시간 ↑, DB 작업 일관성 ✓
- 없음: 커넥션 획득/반납 오버헤드 ↑, 개별 커밋
```

## **@Transactional rollback**
롤백 처리에 대한 전략을 잘 세워야 한다. 한 트랜잭션 범위 내에서 `Unchecked Exception`이 발생하면 자동 롤백되지만, `Checked Exception`은 기본적으로 커밋된다. 이는 기본적인 개념이고, @Transactional을 어떻게 사용하느냐에 따라 동작이 어떻게 달라지는지 확실히 알아야 한다.

##### **_TransactionAspectSupport의 동작 원리_**
`TransactionAspectSupport`는 `@Transactional`이 붙은 메소드를 실행할 때 트랜잭션 처리를 담당하는 핵심 클래스이다. Spring은 AOP 프록시 패턴을 통해 실제 메서드 호출 전후로 트랜잭션 시작, 커밋, 롤백 로직을 삽입한다.

**Unchecked Exception 롤백 정책**
- **Unchecked Exception** (RuntimeException, Error): 자동 롤백
- **Checked Exception** (IOException, SQLException 등): 롤백 안함

이는 Unchecked Exception이 예상치 못한 프로그래밍 오류나 시스템 장애를 나타내는 반면, Checked Exception은 예상 가능한 상황으로 개발자가 의도적인 예외 처리 로직을 작성했을 가능성이 높기 때문이다.

**try-catch로 감싸도 롤백되는 이유**  
`RuntimeException`이 발생하는 순간 Spring은 현재 트랜잭션을 "rollback-only" 상태로 마킹한다. 이후 try-catch로 예외를 처리해서 메서드가 정상 종료되어도, 이미 마킹된 트랜잭션은 최종적으로 롤백된다. 트랜잭션 상태는 예외 발생 시점에 결정되며, 예외 처리 여부는 이 결정을 바꾸지 못한다.

```java
@Transactional
public void save() {
    authorRepository.save(new Author("홍길동"));

    try {
        actionService.doAction();
    } catch (Exception ignored) { }
}

@Transactional
public void doAction() throws Exception {
    throw new Exception("Error");   // Checked Exception: 롤백 안함
}

@Transactional
public void doAction() {
    throw new RuntimeException("Error");    // Unchecked Exception: 자동 롤백 
}
```

##### **_REQUIRES_NEW를 활용한 독립 트랜잭션_**
`@Transactional(propagation = Propagation.REQUIRES_NEW)`를 사용하면 별도의 독립적인 트랜잭션이 생성된다. 이 경우 내부 트랜잭션에서 예외가 발생해도 해당 트랜잭션만 롤백되고, 외부 트랜잭션은 영향받지 않는다. 따라서 로그 저장이나 감사(audit) 기록처럼 메인 비즈니스 로직 실패와 관계없이 반드시 저장되어야 하는 데이터에 활용할 수 있다.

```java
@Transactional(propagation = Propagation.REQUIRES_NEW)
public void doAction() {
    throw new RuntimeException("Error");    // Unchecked Exception: 자동 롤백 
}
```

그러나 이는 커넥션 풀에서 새로운 커넥션을 얻어온다는 의미이기 때문에, REQUIRES_NEW가 붙은 메소드를 반복문을 통해 호출한다면 로직에 따라 커넥션 풀이 고갈되어 타임아웃이나 대기 상황이 발생할 수 있다. 특히 외부 트랜잭션이 커넥션을 점유한 상태에서 내부적으로 여러 개의 독립 트랜잭션을 동시에 생성하려 할 때 주의해야 한다.

##### **_동일한 클래스 내부 호출 시 @Transactional 무시_**
```java
@Transactional
public void save() {
    authorRepository.save(new Author("홍길동"));

    try {
        this.doAction();
    } catch (Exception ignored) { }
}

@Transactional
public void doAction() {
    throw new RuntimeException("Error");
}
```
외부에서 save() 호출 시 프록시를 통해 트랜잭션이 시작되지만, this.doAction() 호출은 직접적인 Java 메서드 호출이므로 Spring 프록시가 개입할 수 없다. 따라서 doAction()의 @Transactional은 무시되고 Unchecked Exception이 발생해도 롤백되지 않는다.

롤백이 되어야 한다면 다음 방법중 하나를 선택하면 된다.
1. try-catch 제거
2. 수동 롤백 (TransactionAspectSupport.currentTransactionStatus().setRollbackOnly())
3. 별도 서비스로 분리
4. Self Injection 사용 (allow-circular-references: true 필요)
5. AspectJ 위빙 사용 (비추천)

##### **_@Transactional 유무에 따른 차이점_**

`doAction()`에 `@Transactional`이 있든 없든 Repository 호출 시 기존 트랜잭션에 참여하는 건 동일하다. 하지만 예외 처리에서 중요한 차이가 있다.

```java
@Transactional
public void save() {
    authorRepository.save(new Author("홍길동"));

    try {
        actionService.doAction();
    } catch (Exception ignored) { }
}

public void doAction() {
    authorRepository.save(new Author("거북이")); // 기존 트랜잭션 참여
    throw new RuntimeException("Error");
}
```

doAction()에 @Transactional이 없다. 그래도 두 데이터 모두 저장된다. RuntimeException이 발생해도 단순히 상위로 전파될 뿐이다. try-catch로 잡으면 `save()` 메서드가 정상 종료된 것으로 인식하고 트랜잭션을 커밋한다.

@Transactional이 있는 경우 RuntimeException 발생 시 Spring이 현재 트랜잭션을 **"rollback-only"로 마킹**한다. 이후 try-catch로 예외를 처리해서 `save()` 메서드가 정상 종료되어도, Spring이 커밋을 시도할 때 "rollback-only" 마킹을 발견하고 `UnexpectedRollbackException`을 던진다.

**왜 이런 차이가 발생할까?**

Spring의 트랜잭션 처리 방식을 살펴보자.  
1. **@Transactional 없는 경우:** `doAction()`은 단순한 Java 메서드다. Repository 호출할 때만 기존 트랜잭션을 사용한다. RuntimeException이 발생해도 Spring은 이를 "트랜잭션적 오류"로 인식하지 않는다. 단지 일반적인 예외일 뿐이고, try-catch로 처리되면 아무 문제없이 커밋한다.
2. **@Transactional 있는 경우:** `doAction()`도 트랜잭션 관리 대상이 된다. Spring AOP가 메서드를 감싸서 예외를 모니터링한다. RuntimeException 발생 시 "이 트랜잭션은 문제가 있다"고 마킹해둔다. 이후 상위에서 try-catch로 예외를 처리해도 Spring은 "어? 문제가 있었는데 커밋하려고 하네?"라고 인식하고 `UnexpectedRollbackException`을 던진다.

핵심은 Spring이 **언제 트랜잭션 상태를 추적하느냐**다. @Transactional이 붙어야만 Spring이 해당 메서드의 예외를 "트랜잭션 관점에서" 바라본다.

## **@Transactional(readOnly = true)**
개발을 하다 보면 단순한 조회 메서드에 @Transactional(readOnly = true)를 붙일지 말지 고민하게 된다. 특히 OSIV를 비활성화한 환경에서는 이 선택이 더욱 중요하다.

PostgreSQL 환경에서 실제 쿼리 로그를 통해 두 방식의 차이점을 자세히 알아보자.
```
# application.yml
spring:
  jpa:
    open-in-view: false 

# postgresql.conf
log_statement = 'all'
log_line_prefix = '%t [%p] %u@%d: '
logging_collector = on
```

상황별로 코드를 작성하고 로그를 확인해 보자.
```java
public void test() {
    var list = authorRepository.findAll();
}

[37380] LOG:  statement: BEGIN READ ONLY
[37380] LOG:  execute <unnamed>: select a1_0.id,a1_0.created_at,a1_0.name from author a1_0
[37380] LOG:  execute S_1: COMMIT
```
@Transactional(readOnly = true) 가 붙어있는 경우 트랜잭션이 명시적으로 시작되고 종료된다. 트랜잭션을 `READ ONLY` 로 세팅하는 쿼리와, 조회 후 커밋하는 쿼리가 추가로 날라간다.

```java
public void test() {
    var list = authorRepository.findAllNonTransactional();
    
    // @Query(value = "SELECT a FROM Author a")
    // List<Author> findAllNonTransactional();
}
 
[26408] LOG:  execute <unnamed>: select a1_0.id,a1_0.created_at,a1_0.name from author a1_0
```
어노테이션이 없는 경우 autocommit 모드로 동작하여 단일 쿼리만 실행된다.

> `CrudRepository` 인터페이스에 정의된 메소드를 호출하는 경우 구현체인 `SimpleJpaRepository` 클래스에 @Transactional(readOnly = true) 가 붙어있기 때문에 기본적으로 readOnly 모드로 동작한다.

##### **_기능별 상세 비교_**

**Hibernate 측면**  
_@Transactional(readOnly = true)_  
장점
- 1차 캐시 활용: 동일한 엔티티를 여러 번 조회해도 캐시에서 가져온다
- Lazy Loading 지원: 연관관계 엔티티를 필요할 때 로드할 수 있다
- FlushMode.MANUAL: 불필요한 flush 작업을 방지한다  

단점
- 세션 장기 보유: 메서드 실행 동안 Hibernate 세션을 계속 유지한다
- 메모리 사용량 증가: 1차 캐시와 세션 컨텍스트로 인한 메모리 오버헤드  

_어노테이션 제거_  
장점
- 즉시 세션 해제: 쿼리 실행 후 바로 세션을 정리한다
- 최소 메모리 사용: 세션 컨텍스트를 오래 보유하지 않는다

단점
- Lazy Loading 불가: LazyInitializationException 발생 위험
- 1차 캐시 미활용: 동일한 엔티티를 여러 번 조회하면 매번 DB 쿼리
- 세션 재생성: 매번 새로운 세션을 생성하는 비용

**Spring 측면 (프록시)**  
_@Transactional(readOnly = true)_  
장점
- AOP 기능 활용: 로깅, 모니터링 등 횡단 관심사 처리
- 트랜잭션 전파 규칙: 다른 트랜잭션과의 상호작용을 명확하게 정의
- 일관된 예외 처리: Spring의 트랜잭션 예외 변환 기능 활용

단점
- 프록시 생성 비용: Spring AOP 프록시 생성과 관리 비용
- 인터셉터 체인 실행: 메서드 호출 시마다 인터셉터 체인을 거침
- 메모리 오버헤드: 프록시 객체와 관련 메타데이터

_어노테이션 제거_  
장점
- 프록시 오버헤드 없음: 직접적인 메서드 호출
- 메모리 효율적: 프록시 관련 메모리 사용 없음
- 단순한 실행 흐름: 복잡한 AOP 처리 과정이 없음

단점
- Spring AOP 기능 미사용: 횡단 관심사 처리 불가능
- 트랜잭션 관리 불가: 명시적인 트랜잭션 제어 없음

**PostgreSQL 측면**

_BEGIN READ ONLY vs autocommit_

PostgreSQL에서 BEGIN READ ONLY는 단순한 플래그 설정이 아니라 실제로 다음과 같은 최적화를 제공한다.
- WAL 생성 방지: Write-Ahead Log를 생성하지 않아 I/O 부하 감소
- 락 획득 회피: 불필요한 락 요청을 하지 않음
- 내부 최적화: PostgreSQL이 읽기 전용임을 알고 여러 최적화 수행

반면 autocommit 모드는
- 네트워크 호출 최소화: 단일 쿼리만 전송
- 커넥션 즉시 반환: 쿼리 실행 후 바로 커텍션 풀에 반환  

위와같은 특징을 가지고 있다.

##### **_성능 비교_**
일반적으로 단순 조회에서는 어노테이션 제거가 더 빠른 경우가 많지만, 복잡한 로직에서는 트랜잭션의 이점이 성능 오버헤드를 상쇄한다.

##### **_결론 및 권장사항_**
**@Transactional(readOnly = true) 언제 사용할까?**
- 연관관계(Lazy Loading)가 필요한 모든 경우
- 여러 쿼리의 일관성이 중요한 경우
- 복잡한 비즈니스 로직이 있는 경우
- Spring의 트랜잭션 관리 기능을 활용하고 싶은 경우

**이럴때는 제거해도 되지 않을까?**
- 완전히 단순한 단일 조회 (연관관계 없음)
- DTO 프로젝션만 사용하는 경우
- 극도의 성능 최적화가 필요한 경우
- 대량 데이터 처리에서 메모리 효율성이 중요한 경우

##### **_개인적인 생각 (PostgreSQL 기준)_**
1. 안전성: Lazy Loading 관련 예외를 방지할 수 있다
2. 확장성: 나중에 연관관계나 복잡한 로직이 추가되어도 안전하다
3. 일관성: 팀 전체가 동일한 패턴을 사용할 수 있다
4. PostgreSQL 최적화: READ ONLY 모드의 이점을 활용할 수 있다

성능이 정말 중요한 특정 API에만 선별적으로 어노테이션을 제거하고, 나머지는 @Transactional(readOnly = true)를 기본으로 사용하는 것이 현실적인것 같다.
실제 성능은 애플리케이션의 특성, 데이터 크기, 인프라 환경에 따라 달라질 수 있으니, 중요한 결정을 내리기 전에는 항상 실제 환경에서 테스트해보는 것을 잊지 말자.

## **격리 수준(Isolation Level) 실전 활용**

격리 수준은 동시 트랜잭션 간의 데이터 일관성을 얼마나 엄격하게 보장할지를 결정한다. PostgreSQL의 기본 격리 수준은 `READ_COMMITTED`이며, 비즈니스 요구사항에 따라 적절한 수준을 선택해야 한다.

```java
@Transactional(isolation = Isolation.READ_COMMITTED)
public void readCommittedTest() {
    // PostgreSQL 기본 격리 수준 - 성능 우선
}

@Transactional(isolation = Isolation.REPEATABLE_READ)
public void repeatableReadTest() {
    // 일관성 우선 - Snapshot Isolation 제공
}
```

**격리 수준별 현상과 문제점**
- **Dirty Read:** 커밋되지 않은 변경사항을 읽는 현상
- **Non-repeatable Read:** 같은 트랜잭션 내에서 동일한 데이터를 재조회할 때 다른 값이 나오는 현상
- **Phantom Read:** 범위 조건으로 조회 시 새로운 행이 추가로 조회되는 현상

##### **_READ_COMMITTED (기본값)_**
```java
@Transactional(isolation = Isolation.READ_COMMITTED)
public void processOrderWithReadCommitted() {
    // 첫 번째 조회
    var product = productRepository.findById(1L);
    System.out.println("첫 번째 재고: " + product.getStock()); // 100

    // 이 시점에 다른 트랜잭션이 재고를 50으로 변경하고 커밋

    // 두 번째 조회 - 변경된 값 읽음 (Non-repeatable Read 발생)
    product = productRepository.findById(1L);
    System.out.println("두 번째 재고: " + product.getStock()); // 50

    // 문제: 같은 트랜잭션 내에서 데이터가 달라짐
    // 첫 번째 조회를 기준으로 비즈니스 로직을 작성했다면 문제가 될 수 있음
}
```

**READ_COMMITTED 특징:**
- **Dirty Read 방지:** 커밋된 데이터만 읽음
- **Non-repeatable Read 허용:** 다른 트랜잭션의 커밋된 변경사항이 중간에 보임
- **Phantom Read 허용:** 범위 조건에서 새로운 행이 나타날 수 있음
- **성능:** 가장 높음 (잠금이 적음)
- **사용 시기:** 성능이 중요하고 약간의 데이터 불일치를 허용할 수 있는 경우

##### **_REPEATABLE_READ_**
```java
@Transactional(isolation = Isolation.REPEATABLE_READ)
public void processOrderWithRepeatableRead() {
    // 첫 번째 조회 - 스냅샷 생성
    var product = productRepository.findById(1L);
    System.out.println("첫 번째 재고: " + product.getStock()); // 100

    // 이 시점에 다른 트랜잭션이 재고를 50으로 변경하고 커밋해도

    // 두 번째 조회 - 스냅샷에 의해 동일한 값 읽음
    product = productRepository.findById(1L);
    System.out.println("두 번째 재고: " + product.getStock()); // 100 (동일)

    // 장점: 트랜잭션 내에서 일관된 데이터 보장
    // 단점: 다른 트랜잭션의 변경사항을 못 볼 수 있음 (Lost Update 위험)
}
```

**REPEATABLE_READ 특징:**
- **Snapshot Isolation:** 트랜잭션 시작 시점의 데이터 스냅샷 유지
- **Non-repeatable Read 방지:** 동일한 데이터 반복 읽기 시 일관성 보장
- **Phantom Read 일부 방지:** PostgreSQL에서는 대부분 방지됨
- **성능:** 중간 (스냅샷 유지 오버헤드)
- **사용 시기:** 복잡한 비즈니스 로직에서 데이터 일관성이 중요한 경우

##### **_실제 비즈니스 활용 사례_**

**1. 재고 차감 로직 (동시성 제어)**
```java
@Transactional(isolation = Isolation.REPEATABLE_READ)
public OrderResult decreaseStock(Long productId, int quantity) {
    // 스냅샷으로 일관된 데이터 보장
    var product = productRepository.findById(productId).get();

    // 재고 검증 - 트랜잭션 내에서 일관된 값으로 검증
    if (product.getStock() < quantity) {
        return OrderResult.fail("재고 부족: 현재 " + product.getStock() + "개");
    }

    // 재고 차감
    product.decreaseStock(quantity);
    productRepository.save(product);

    return OrderResult.success("주문 완료");
}

// 주의: REPEATABLE_READ에서도 Lost Update는 발생할 수 있음
// 따라서 낙관적 락(@Version) 또는 비관적 락 추가 고려 필요
```

**2. 금융 거래 처리**
```java
@Transactional(isolation = Isolation.REPEATABLE_READ)
public TransferResult transfer(Long fromAccountId, Long toAccountId, BigDecimal amount) {
    // 일관된 스냅샷으로 계좌 정보 조회
    var fromAccount = accountRepository.findById(fromAccountId).get();
    var toAccount = accountRepository.findById(toAccountId).get();

    // 잔액 검증 - 스냅샷으로 일관성 보장
    if (fromAccount.getBalance().compareTo(amount) < 0) {
        return TransferResult.fail("잔액 부족");
    }

    // 이체 처리
    fromAccount.withdraw(amount);
    toAccount.deposit(amount);

    accountRepository.saveAll(List.of(fromAccount, toAccount));

    return TransferResult.success("이체 완료");
}
```

**3. 보고서 생성 (데이터 정합성)**
```java
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public DailySalesReport generateSalesReport(LocalDate date) {
    // 보고서 생성 중 데이터 변경되어도 일관된 스냅샷으로 작업
    var orders = orderRepository.findByOrderDate(date);

    // 주문 총액 계산
    var totalAmount = orders.stream()
            .map(Order::getAmount)
            .reduce(BigDecimal.ZERO, BigDecimal::add);

    // 카테고리별 집계 - 모두 동일한 스냅샷 기준
    var categoryStats = orders.stream()
            .collect(Collectors.groupingBy(
                Order::getCategoryId,
                Collectors.summingDouble(order -> order.getAmount().doubleValue())
            ));

    return new DailySalesReport(date, totalAmount, orders.size(), categoryStats);
}
```

**4. READ_COMMITTED 적절한 사용 사례**
```java
@Transactional(isolation = Isolation.READ_COMMITTED)
public void logUserActivity(Long userId, String activity) {
    // 로깅은 약간의 불일치가 있어도 무관
    // 성능을 우선시하는 것이 맞음
    var user = userRepository.findById(userId).orElse(null);
    if (user != null) {
        activityLogRepository.save(new ActivityLog(userId, activity, LocalDateTime.now()));
    }
}
```

**성능 vs 일관성 선택 가이드**
- **READ_COMMITTED:** 로깅, 단순 조회, 성능이 중요한 대량 처리
- **REPEATABLE_READ:** 금융 거래, 재고 관리, 복잡한 비즈니스 로직, 보고서 생성
- **SERIALIZABLE:** 극도로 중요한 데이터 (일반적으로 성능상 비추천)

**주의사항**
- 격리 수준만으로는 모든 동시성 문제가 해결되지 않음
- 필요시 낙관적 락(@Version) 또는 비관적 락(SELECT FOR UPDATE) 추가 고려
- 격리 수준이 높을수록 데드락 발생 가능성 증가

## **@Transactional과 LazyInitializationException**

LazyInitializationException은 Hibernate를 사용할 때 자주 마주치는 문제다. 특히 `spring.jpa.open-in-view: false` 설정을 사용하는 환경에서 트랜잭션이 끝난 후 지연 로딩을 시도할 때 발생한다.

**문제 발생 시나리오**

```java
@Entity
public class Author {
    @Id
    private Long id;
    private String name;

    @OneToMany(mappedBy = "author", fetch = FetchType.LAZY) // 기본값: LAZY
    private List<Book> books = new ArrayList<>();

    // getter, setter...
}

@Transactional(readOnly = true)
public Author findAuthor(Long id) {
    return authorRepository.findById(id).orElse(null);
    // 트랜잭션이 여기서 종료됨
}

@GetMapping("/authors/{id}")
public ResponseEntity<AuthorResponse> getAuthor(@PathVariable Long id) {
    var author = authorService.findAuthor(id); // 트랜잭션 종료

    // 여기서 LazyInitializationException 발생!
    // could not initialize proxy - no Session
    var bookTitles = author.getBooks().stream()
            .map(Book::getTitle)
            .collect(Collectors.toList());

    return ResponseEntity.ok(new AuthorResponse(author.getName(), bookTitles));
}
```

**왜 발생하는가?**

1. **JPA Session (EntityManager) 종료**: 트랜잭션이 끝나면 Session도 함께 닫힘
2. **프록시 객체의 한계**: Lazy 컬렉션은 프록시로 래핑되어 있어 Session이 필요
3. **open-in-view: false**: HTTP 요청 범위에서 Session을 유지하지 않음

```java
// Author 객체 내부의 books 필드는 실제로 이런 프록시
books = new PersistentBag(); // Hibernate의 지연 로딩 컬렉션
// Session이 없으면 실제 데이터를 가져올 수 없음
```

**해결 방법**

##### **_1. 트랜잭션 범위 확장 (Controller에 @Transactional)_**
```java
@GetMapping("/authors/{id}")
@Transactional(readOnly = true) // 트랜잭션을 Controller까지 확장
public ResponseEntity<AuthorResponse> getAuthor(@PathVariable Long id) {
    var author = authorService.findAuthor(id);

    // 트랜잭션 내에서 Lazy Loading 수행 - 정상 동작
    var bookTitles = author.getBooks().stream()
            .map(Book::getTitle)
            .collect(Collectors.toList());

    return ResponseEntity.ok(new AuthorResponse(author.getName(), bookTitles));
}
```
**장점:** 간단한 수정  
**단점:** Controller에 트랜잭션 로직이 들어감, 레이어 경계가 모호해짐

##### **_2. Eager Fetch Join 사용_**
```java
@Repository
public interface AuthorRepository extends JpaRepository<Author, Long> {

    @Query("SELECT a FROM Author a JOIN FETCH a.books WHERE a.id = :id")
    Optional<Author> findByIdWithBooks(@Param("id") Long id);

    // 또는 여러 연관관계를 한 번에
    @Query("SELECT DISTINCT a FROM Author a " +
           "JOIN FETCH a.books b " +
           "JOIN FETCH b.category " +
           "WHERE a.id = :id")
    Optional<Author> findByIdWithBooksAndCategories(@Param("id") Long id);
}

@Service
public class AuthorService {
    @Transactional(readOnly = true)
    public Author findAuthorWithBooks(Long id) {
        return authorRepository.findByIdWithBooks(id).orElse(null);
        // books 데이터가 이미 로드되어 있어서 Session 종료 후에도 접근 가능
    }
}
```
**장점:** 명확한 데이터 로딩, N+1 문제 해결  
**단점:** 항상 연관 데이터를 로드함 (불필요한 경우에도)

##### **_3. @EntityGraph 활용_**
```java
@Repository
public interface AuthorRepository extends JpaRepository<Author, Long> {

    @EntityGraph(attributePaths = {"books", "books.category"})
    @Query("SELECT a FROM Author a WHERE a.id = :id")
    Optional<Author> findByIdWithBooks(@Param("id") Long id);

    // 여러 시나리오에 대응
    @EntityGraph(attributePaths = {"books"})
    Optional<Author> findById(Long id); // 기본 메서드 오버라이드
}
```
**장점:** 선언적 방식, 유연함  
**단점:** 복잡한 그래프에서는 예측이 어려울 수 있음

##### **_4. DTO 변환을 트랜잭션 내에서 (권장)_**
```java
@Transactional(readOnly = true)
public AuthorResponse findAuthorResponse(Long id) {
    var author = authorRepository.findById(id).orElse(null);
    if (author == null) {
        return null;
    }

    // 트랜잭션 내에서 필요한 데이터를 모두 접근하여 DTO로 변환
    var bookTitles = author.getBooks().stream()
            .map(Book::getTitle)
            .collect(Collectors.toList());

    var authorStats = AuthorStats.builder()
            .totalBooks(author.getBooks().size())
            .avgRating(calculateAverageRating(author.getBooks()))
            .build();

    return AuthorResponse.builder()
            .name(author.getName())
            .email(author.getEmail())
            .bookTitles(bookTitles)
            .stats(authorStats)
            .build();
}

private double calculateAverageRating(List<Book> books) {
    return books.stream()
            .mapToDouble(Book::getRating)
            .average()
            .orElse(0.0);
}

@GetMapping("/authors/{id}")
public ResponseEntity<AuthorResponse> getAuthor(@PathVariable Long id) {
    var response = authorService.findAuthorResponse(id);
    return response != null
        ? ResponseEntity.ok(response)
        : ResponseEntity.notFound().build();
}
```
**장점:** 명확한 레이어 분리, 필요한 데이터만 노출, 성능 최적화  
**단점:** DTO 클래스 추가 필요

##### **_5. Batch Fetch Size 설정으로 N+1 문제 완화_**
```yaml
spring:
  jpa:
    properties:
      hibernate:
        default_batch_fetch_size: 100 # 한 번에 100개씩 배치로 로딩
        jdbc:
          batch_size: 50 # INSERT/UPDATE 배치 크기
```

```java
@Transactional(readOnly = true)
public List<AuthorResponse> findAllAuthorsWithBooks() {
    var authors = authorRepository.findAll(); // 1번 쿼리

    return authors.stream()
            .map(author -> {
                // Batch Fetch Size 덕분에 100개씩 묶어서 쿼리 실행
                // N+1이 아니라 N/100+1 쿼리로 최적화
                var bookTitles = author.getBooks().stream()
                        .map(Book::getTitle)
                        .collect(Collectors.toList());
                return new AuthorResponse(author.getName(), bookTitles);
            })
            .collect(Collectors.toList());
}
```

##### **_6. 프로젝션(Projection) 활용_**
```java
public interface AuthorBookProjection {
    String getName();
    String getEmail();
    List<BookInfo> getBooks();

    interface BookInfo {
        String getTitle();
        String getIsbn();
        BigDecimal getPrice();
    }
}

@Repository
public interface AuthorRepository extends JpaRepository<Author, Long> {

    @Query("SELECT a.name as name, a.email as email, " +
           "b.title as books_title, b.isbn as books_isbn, b.price as books_price " +
           "FROM Author a LEFT JOIN a.books b WHERE a.id = :id")
    AuthorBookProjection findAuthorBookProjection(@Param("id") Long id);
}
```

**성능 최적화 실전 팁**

**1. 연관관계 설계 시 고려사항**
```java
@Entity
public class Author {
    // 필수: 양방향 관계에서 연관관계 주인 설정
    @OneToMany(mappedBy = "author", fetch = FetchType.LAZY)
    private List<Book> books = new ArrayList<>();

    // 성능 최적화: 컬렉션 초기화
    public List<Book> getBooks() {
        return books != null ? books : Collections.emptyList();
    }

    // 편의 메서드: Lazy Loading을 위한 크기 체크
    public boolean hasBooks() {
        return books != null && !books.isEmpty();
    }

    public int getBooksCount() {
        return books != null ? books.size() : 0; // size() 호출 시 실제 로딩됨
    }
}
```

**2. 조건부 Lazy Loading**
```java
@Service
public class AuthorService {

    @Transactional(readOnly = true)
    public AuthorResponse findAuthorResponse(Long id, boolean includeBooks) {
        var author = authorRepository.findById(id).orElse(null);
        if (author == null) return null;

        var builder = AuthorResponse.builder()
                .name(author.getName())
                .email(author.getEmail());

        // 필요한 경우에만 Lazy Loading 수행
        if (includeBooks && author.hasBooks()) {
            var bookTitles = author.getBooks().stream()
                    .map(Book::getTitle)
                    .collect(Collectors.toList());
            builder.bookTitles(bookTitles);
        }

        return builder.build();
    }
}
```

**핵심 원칙**
- **데이터 접근은 트랜잭션 내에서**: Session이 열려있을 때 모든 필요 데이터에 접근
- **명시적 데이터 로딩**: Fetch Join, EntityGraph 등으로 의도를 명확히 표현
- **적절한 DTO 활용**: 필요한 데이터만 추출하여 레이어 간 결합도 감소
- **성능 측정 기반 최적화**: N+1 문제와 메모리 사용량을 모니터링하며 최적화

## **Dirty Checking 이해하기**

Hibernate의 핵심 기능 중 하나인 Dirty Checking에 대해 알아보자.

```java
@Transactional
public void updateAuthor(Long id) {
    var author = authorRepository.findById(id).get();

    // 엔티티 수정 - 명시적인 save() 호출 없이도 UPDATE 쿼리 실행됨
    author.setName("변경된 이름");
    author.setEmail("new@email.com");

    // 트랜잭션 커밋 시점에 자동으로 UPDATE 쿼리 생성
}
```

**Dirty Checking 동작 원리**

1. **1차 캐시 저장 시점**: 엔티티 조회 시 현재 상태의 스냅샷을 생성
2. **트랜잭션 커밋 시점**: 현재 엔티티와 스냅샷을 비교
3. **변경 감지**: 달라진 필드가 있으면 UPDATE 쿼리 자동 생성

```java
// 내부 동작 개념
public class EntityEntry {
    private Object entity;        // 현재 엔티티
    private Object[] snapshot;    // 조회 시점의 스냅샷

    public boolean requiresUpdate() {
        // 현재 엔티티와 스냅샷 비교
        return !Arrays.equals(getCurrentState(), snapshot);
    }
}
```

**성능 고려사항**

**1. 불필요한 스냅샷 생성 방지**
```java
@Transactional(readOnly = true)
public List<AuthorDto> findAllAuthorsForReport() {
    return authorRepository.findAll().stream()
            .map(author -> new AuthorDto(author.getName(), author.getEmail()))
            .collect(Collectors.toList());
}
```
읽기 전용이므로 스냅샷 생성하지 않음

**2. 대용량 조회 시 주의**
```java
@Transactional
public void processAllAuthors() {
    var authors = authorRepository.findAll(); // 1만건 조회

    // 1만개의 스냅샷 생성 → 메모리 사용량 증가
    // 실제로는 수정하지 않아도 스냅샷은 생성됨

    authors.forEach(author -> {
        // 단순 읽기 작업만 수행
        generateReport(author);
    });
}
```

**3. 선택적 업데이트 vs 전체 필드 업데이트**
```java
// @DynamicUpdate 없는 경우 - 모든 필드 UPDATE
@Entity
public class Author {
    // UPDATE author SET name=?, email=?, created_at=? WHERE id=?
}

// @DynamicUpdate 있는 경우 - 변경된 필드만 UPDATE
@Entity
@DynamicUpdate
public class Author {
    // UPDATE author SET name=? WHERE id=?
}
```

**최적화 팁**
- 단순 조회만 하는 경우: `@Transactional(readOnly = true)` 또는 트랜잭션 없이
- 대용량 데이터 처리: 청크 단위로 분할하여 메모리 사용량 제어
- 부분 업데이트: `@DynamicUpdate` 활용
