package com.continuuity.data.operation.executor.remote;

import com.continuuity.common.conf.CConfiguration;
import com.continuuity.common.conf.Constants;
import com.continuuity.common.discovery.ServiceDiscoveryClient;
import com.continuuity.common.service.AbstractRegisteredServer;
import com.continuuity.common.utils.ImmutablePair;
import com.continuuity.data.operation.executor.OperationExecutor;
import com.continuuity.data.operation.executor.remote.stubs.TOperationExecutor;
import com.google.inject.Inject;
import com.google.inject.name.Named;
import org.apache.thrift.server.THsHaServer;
import org.apache.thrift.transport.TNonblockingServerSocket;
import org.apache.thrift.transport.TTransportException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * This implements an Operation Executor as a Thrift service. It registers
 * itself with the service discovery under the name "opex-service" (@see
 * SERVICE_NAME).
 *
 * Configuration:
 * <ul><li>
 *   data.opex.server.port (@see Constants.CFG_DATA_OPEX_SERVER_PORT) for the
 *   port number to bind the server to. Default is 15165.
 * </li><li>
 *   data.opex.server.threads (@see Constants.CFG_DATA_OPEX_SERVER_THREADS) for
 *   the number of worker threads to start. Default is 20.
 * </li></ul>
 *
 * The thrift service is not meant to be called directly, but through an
 * instance of @link RemoteOperationExecutor.
 */
public class OperationExecutorService extends AbstractRegisteredServer {

  private static final Logger Log =
      LoggerFactory.getLogger(OperationExecutorService.class);

  /** the name of this service in the service discovery */
  public static final String SERVICE_NAME = "opex-service";

  /* the port to run on */
  int port;

  /* the number of threads to use for the thrift service */
  int threads;

  /* the thrift service */
  THsHaServer server;

  /* the operation executor for the actual data fabric */
  OperationExecutor opex;

  /* a pool of threads for the thrift service */
  ExecutorService executorService;

  /**
   * All this does is set the name of the service so that it can
   * be uniquely identified by the service discovery client. The
   * name for this service is "opex-service".
   * @param opex the operation executor to use.
   */
  @Inject
  public OperationExecutorService(
      @Named("DataFabricOperationExecutor")OperationExecutor opex) {
    super.setServerName(SERVICE_NAME);
    this.opex = opex;
  }

  @Override
  protected ImmutablePair<ServiceDiscoveryClient.ServicePayload, Integer>
  configure(String[] args, CConfiguration conf) {

    try {
      // Retrieve the port and the number of threads for the service
      this.port = conf.getInt(Constants.CFG_DATA_OPEX_SERVER_PORT,
          Constants.DEFAULT_DATA_OPEX_SERVER_PORT);
      this.threads = conf.getInt(Constants.CFG_DATA_OPEX_SERVER_THREADS,
          Constants.DEFAULT_DATA_OPEX_SERVER_THREADS);


      Log.info("Configuring Operation Executor Service: " + this.threads +
          " threads on port " + this.port);

      // create a new thread pool
      this.executorService = Executors.newCachedThreadPool();

      // configure a thrift service
      THsHaServer.Args serverArgs =
          new THsHaServer.Args(new TNonblockingServerSocket(port))
              .executorService(executorService)
              .processor(new TOperationExecutor.
                  Processor<TOperationExecutor.Iface>(
                      new TOperationExecutorImpl(this.opex)))
              .workerThreads(20);
      this.server = new THsHaServer(serverArgs);

      // create the discovery payload with the number of threads
      ServiceDiscoveryClient.ServicePayload payload =
          new ServiceDiscoveryClient.ServicePayload();
      payload.add("threads", Integer.toString(this.threads));

      // and done, return the payload
      return new ImmutablePair<ServiceDiscoveryClient.ServicePayload, Integer>(
          payload, this.port);

    } catch (TTransportException e) {
      Log.error("Failed to create THsHa server for Operation Executor " +
          "Service. Reason : {}", e.getMessage());
      this.stop();
    }
    return null;
  }

  @Override
  protected Thread start() {
    return new Thread() {
      public void run() {
        Log.info("Starting Operation Executor Service on port " +
            OperationExecutorService.this.port);
        // serve() blocks and will only return when stop() is called
        OperationExecutorService.this.server.serve();
      }
    };
  }

  @Override
  protected void stop() {
    Log.info("Stopping Operation Executor Service on port " +
        OperationExecutorService.this.port);
    if (this.server != null) {
      this.server.stop();
      this.server = null;
    }
    if (this.executorService != null) {
      this.executorService.shutdown();
      this.executorService = null;
    }
    Log.info("Operation Executor Service on port " +
        OperationExecutorService.this.port + " is stopped");
  }

  @Override
  protected boolean ruok() {
    // server may be null if this is called before configure(),
    // or if configure() failed, or if called after stop().
    return (this.server != null) && (this.server.isServing());
  }
}
